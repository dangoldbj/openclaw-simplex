import path from "node:path";
import { resolveChannelMediaMaxBytes } from "openclaw/plugin-sdk/media-runtime";
import { resolveMediaBufferPath } from "openclaw/plugin-sdk/media-store";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { SimplexAccountScope } from "../../types/config.js";
import type { SimplexComposedMessage, SimplexMsgContent } from "../../types/simplex.js";
import {
  measureSimplexContentOverheadBytes,
  measureSimplexQuoteBytes,
  planSimplexTextParts,
} from "../messaging/simplex-message-fit.js";
import { getSimplexRuntime } from "../runtime.js";
import {
  isSimplexReadablePath,
  resolveSimplexOutboundClientDir,
  resolveSimplexOutboundDir,
  stageOutboundBuffer,
  stageOutboundLocalFile,
  toClientOutboundPath,
} from "./outbound-files.js";

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export function resolveSimplexMediaMaxBytes(params: SimplexAccountScope): number {
  return (
    resolveChannelMediaMaxBytes({
      cfg: params.cfg,
      resolveChannelLimitMb: ({ cfg, accountId }) =>
        cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts?.[accountId]?.mediaMaxMb ??
        cfg.channels?.[SIMPLEX_CHANNEL_ID]?.mediaMaxMb,
      accountId: params.accountId,
    }) ?? DEFAULT_MAX_BYTES
  );
}

async function resolveMediaPath(params: {
  mediaUrl: string;
  maxBytes: number;
  outboundDir?: string;
  outboundClientDir?: string;
}): Promise<{ path: string; contentType?: string; fileName?: string }> {
  const core = getSimplexRuntime();
  const mediaUrlLower = params.mediaUrl.toLowerCase();
  if (mediaUrlLower.startsWith("http:") || mediaUrlLower.startsWith("https:")) {
    const fetched = await core.channel.media.fetchRemoteMedia({
      url: params.mediaUrl,
      maxBytes: params.maxBytes,
      filePathHint: params.mediaUrl,
    });
    // Shared outbound dir configured: write the buffer where the runtime can
    // read it (containerized runtime), instead of OpenClaw's media store.
    if (params.outboundDir) {
      const staged = await stageOutboundBuffer({
        outboundDir: params.outboundDir,
        clientDir: params.outboundClientDir,
        buffer: fetched.buffer,
        fileName: fetched.fileName,
      });
      return { path: staged, contentType: fetched.contentType, fileName: fetched.fileName };
    }
    const saved = await core.channel.media.saveMediaBuffer(
      fetched.buffer,
      fetched.contentType,
      SIMPLEX_CHANNEL_ID,
      params.maxBytes,
      fetched.fileName
    );
    return { path: saved.path, contentType: saved.contentType, fileName: fetched.fileName };
  }
  // media://<subdir>/<id> references point into OpenClaw's media store (e.g.
  // media://inbound/<id> to re-send a received file). Resolve to the physical
  // path via the store's read-side helper, then treat it as a local path.
  let localPath = params.mediaUrl;
  if (mediaUrlLower.startsWith("media://")) {
    const match = /^media:\/\/([^/]+)\/(.+)$/.exec(params.mediaUrl);
    if (!match?.[1] || !match[2]) {
      throw new Error(`Invalid media reference: ${params.mediaUrl}`);
    }
    localPath = await resolveMediaBufferPath(match[2], match[1]);
  }
  const contentType = await core.media.detectMime({ filePath: localPath });
  const fileName = path.basename(localPath);
  if (params.outboundDir) {
    // Already inside the shared dir: no copy needed, just translate the path to
    // how the runtime sees it (a no-op when outboundClientDir is unset).
    if (isSimplexReadablePath(localPath, params.outboundDir)) {
      return {
        path: toClientOutboundPath(localPath, params.outboundDir, params.outboundClientDir),
        contentType,
        fileName,
      };
    }
    // Local path the runtime cannot see: copy it into the shared outbound dir.
    const staged = await stageOutboundLocalFile({
      outboundDir: params.outboundDir,
      clientDir: params.outboundClientDir,
      sourcePath: localPath,
    });
    return { path: staged, contentType, fileName };
  }
  return { path: localPath, contentType, fileName };
}

function buildMediaMsgContent(params: {
  text: string;
  mediaPath: string;
  contentType?: string;
  fileName?: string;
  audioAsVoice?: boolean;
}): SimplexMsgContent {
  const core = getSimplexRuntime();
  const contentType = params.contentType?.split(";")[0]?.trim();
  const mediaKind = contentType ? core.media.mediaKindFromMime(contentType) : "unknown";
  const voiceCompatible = core.media.isVoiceCompatibleAudio({
    contentType,
    fileName: params.fileName,
  });
  const wantsVoice = params.audioAsVoice === true && (mediaKind === "audio" || voiceCompatible);

  if (mediaKind === "image") {
    return {
      type: "image",
      text: params.text,
      image: params.fileName ?? params.mediaPath,
    };
  }
  if (mediaKind === "video") {
    return {
      type: "video",
      text: params.text,
      image: params.fileName ?? "",
      duration: 0,
    };
  }
  if (wantsVoice) {
    return {
      type: "voice",
      text: params.text,
      duration: 0,
    };
  }
  return {
    type: "file",
    text: params.text,
  };
}

export type SimplexOutboundQuote = {
  itemId: number;
  /** The quoted item's content, which `simplex-chat` embeds in the reply. */
  content: SimplexMsgContent;
};

function textMessage(text: string): SimplexComposedMessage {
  return { msgContent: { type: "text", text }, mentions: {} };
}

/**
 * Composes outbound messages that each fit `simplex-chat`'s encoded size limit.
 * Text that does not fit is continued in further text messages, and a quote
 * rides on the first message only.
 */
export async function buildComposedMessages(
  params: SimplexAccountScope & {
    text?: string;
    mediaUrls?: string[];
    mediaUrl?: string;
    audioAsVoice?: boolean;
    quote?: SimplexOutboundQuote;
  }
): Promise<SimplexComposedMessage[]> {
  const text = params.text ?? "";
  const mediaList = params.mediaUrls?.length
    ? params.mediaUrls
    : params.mediaUrl
      ? [params.mediaUrl]
      : [];

  if (mediaList.length === 0) {
    const empty = textMessage("").msgContent;
    const plan = planSimplexTextParts({
      text,
      overheadBytes: measureSimplexContentOverheadBytes(empty),
      quoteBytes: params.quote
        ? measureSimplexQuoteBytes(params.quote.content, empty.type)
        : undefined,
    });
    return plan.parts.map((part, index) => ({
      ...textMessage(part),
      ...(plan.quoted && index === 0 ? { quotedItemId: params.quote?.itemId } : {}),
    }));
  }

  const maxBytes = resolveSimplexMediaMaxBytes({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const outboundDir = resolveSimplexOutboundDir({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  const outboundClientDir = resolveSimplexOutboundClientDir({
    cfg: params.cfg,
    accountId: params.accountId,
  });

  const composedMessages: SimplexComposedMessage[] = [];
  const continuation: string[] = [];
  for (const mediaUrl of mediaList) {
    if (!mediaUrl) {
      continue;
    }
    const resolved = await resolveMediaPath({ mediaUrl, maxBytes, outboundDir, outboundClientDir });
    const msgContent = buildMediaMsgContent({
      text: "",
      mediaPath: resolved.path,
      contentType: resolved.contentType,
      fileName: resolved.fileName,
      audioAsVoice: params.audioAsVoice,
    });
    const first = composedMessages.length === 0;
    // The caption and quote belong to the first media message; caption text
    // that does not fit beside them continues as text after the media.
    const plan = first
      ? planSimplexTextParts({
          text,
          overheadBytes: measureSimplexContentOverheadBytes(msgContent, {
            fileName: resolved.fileName ?? path.basename(resolved.path),
          }),
          quoteBytes: params.quote
            ? measureSimplexQuoteBytes(params.quote.content, msgContent.type)
            : undefined,
        })
      : { parts: [], quoted: false };
    const [caption = "", ...rest] = plan.parts;
    continuation.push(...rest);
    composedMessages.push({
      fileSource: { filePath: resolved.path },
      msgContent: { ...msgContent, text: caption },
      ...(plan.quoted ? { quotedItemId: params.quote?.itemId } : {}),
      mentions: {},
    });
  }

  return [...composedMessages, ...continuation.map(textMessage)];
}
