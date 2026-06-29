import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { SimplexClient } from "../../simplex/runtime/client.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { resolveSimplexMediaMaxBytes } from "../media/simplex-media.js";
import {
  createSimplexLiveReplyController,
  type SimplexLiveReplyPayload,
} from "../messaging/simplex-send.js";
import { getSimplexRuntime } from "../runtime.js";

const PENDING_FILE_TIMEOUT_MS = 90_000;

/**
 * Default files-folder used by the external runtime, matching the default the
 * plugin's own `runtime` service launches `simplex-chat` with (`--files-folder
 * ~/.simplex/files`). Used only to resolve relative inbound paths.
 */
const DEFAULT_INBOUND_FILES_FOLDER = "~/.simplex/files";

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

/**
 * Base directory for resolving relative inbound file paths. When the runtime is
 * started with `--files-folder`, it reports received files as a bare file name
 * relative to that folder, so the plugin must join them against the same path
 * to locate the bytes on disk. Set `connection.filesFolder` to match the
 * runtime's `--files-folder`; it defaults to `~/.simplex/files` (the default the
 * bundled `runtime` service uses). Absolute paths — what the runtime reports
 * when no `--files-folder` is set — bypass this entirely.
 */
export function resolveSimplexInboundDir(account: ResolvedSimplexAccount): string {
  const configured = account.config.connection?.filesFolder?.trim();
  return expandHome(configured || DEFAULT_INBOUND_FILES_FOLDER);
}

type SimplexReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
  replyToId?: string | number | null;
};

export type PendingInboundFile = {
  fileId: number;
  chatRef: string;
  replyToId?: string | number | null;
  ctxPayload: Record<string, unknown>;
  storePath: string;
  sessionKey: string;
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  client: SimplexClient;
  sendPayload: (payload: SimplexReplyPayload) => Promise<void>;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

type QueuedPendingInboundFile = {
  pending: PendingInboundFile;
  timeout: ReturnType<typeof setTimeout>;
  accepted: boolean;
};

const pendingFiles = new Map<string, QueuedPendingInboundFile>();

function pendingKey(accountId: string, fileId: number): string {
  return `${accountId}:${fileId}`;
}

export function isFileAutoAcceptEnabled(account: ResolvedSimplexAccount): boolean {
  return (
    account.config.filePolicy?.autoAccept ?? account.config.connection?.autoAcceptFiles !== false
  );
}

export async function requestFileDownload(params: {
  fileId: number;
  account: ResolvedSimplexAccount;
  client: SimplexClient;
  runtime: RuntimeEnv;
}): Promise<boolean> {
  const { fileId, account, client, runtime } = params;
  if (!isFileAutoAcceptEnabled(account)) {
    return false;
  }
  try {
    await client.receiveFile(fileId);
  } catch (err) {
    runtime.error?.(`[${account.accountId}] SimpleX receive file failed: ${String(err)}`);
    return false;
  }
  return true;
}

/**
 * Whether a pending file still needs its download accepted. The initial
 * /freceive issued on newChatItems can fail because the XFTP file
 * description is not ready yet; the accept is retried on rcvFileDescrReady.
 */
export function shouldRetryFileAccept(accountId: string, fileId: number): boolean {
  const queued = pendingFiles.get(pendingKey(accountId, fileId));
  return Boolean(queued && !queued.accepted);
}

export function markFileAccepted(accountId: string, fileId: number): void {
  const queued = pendingFiles.get(pendingKey(accountId, fileId));
  if (queued) {
    queued.accepted = true;
  }
}

export function queuePendingFile(params: {
  pending: PendingInboundFile;
  accountId: string;
  fileId: number;
}): void {
  const { pending, accountId, fileId } = params;
  const key = pendingKey(accountId, fileId);
  const previous = pendingFiles.get(key);
  if (previous) {
    clearTimeout(previous.timeout);
  }
  const timeout = setTimeout(() => {
    const current = pendingFiles.get(key);
    if (!current) {
      return;
    }
    pendingFiles.delete(key);
    void current.pending.client.cancelFile(fileId).catch((err) => {
      current.pending.runtime.error?.(
        `[${accountId}] SimpleX file timeout cancel failed: ${String(err)}`
      );
    });
    void dispatchInbound({
      pending: current.pending,
      mediaPath: undefined,
      mediaType: undefined,
    }).catch((err) => {
      current.pending.runtime.error?.(
        `[${accountId}] SimpleX pending file timeout: ${String(err)}`
      );
    });
  }, PENDING_FILE_TIMEOUT_MS);
  timeout.unref?.();
  pendingFiles.set(key, { pending, timeout, accepted: false });
}

export async function finalizePendingFile(params: {
  accountId: string;
  fileId: number;
  filePath?: string;
  fileName?: string;
}): Promise<void> {
  const queued = pendingFiles.get(pendingKey(params.accountId, params.fileId));
  if (!queued) {
    return;
  }
  pendingFiles.delete(pendingKey(params.accountId, params.fileId));
  clearTimeout(queued.timeout);
  const { pending } = queued;
  let rawPath = params.filePath?.trim() || undefined;
  // Diagnostic: log the path exactly as the runtime reported it, before any
  // resolution, so the inbound files-folder behavior is observable per
  // transport — whether it is absolute or relative (filename-only), and the
  // literal directory used (e.g. /tmp vs. a $TMPDIR-derived path).
  pending.runtime.log?.(
    `[${params.accountId}] SimpleX inbound file path: ${JSON.stringify(rawPath ?? null)}` +
      (rawPath ? ` (${path.isAbsolute(rawPath) ? "absolute" : "relative"})` : "")
  );
  // The runtime reports received files relative to its --files-folder
  // (fileSource.filePath is then just the file name), so resolve relative paths
  // against the configured files-folder (default ~/.simplex/files).
  if (rawPath && !path.isAbsolute(rawPath)) {
    rawPath = path.join(resolveSimplexInboundDir(pending.account), rawPath);
  }
  let mediaPath: string | undefined;
  let mediaType: string | undefined;
  if (rawPath) {
    const core = getSimplexRuntime();
    // Stage the file into OpenClaw's shared media store (media/inbound/*),
    // like other bundled channels. The raw path from the SimpleX runtime
    // (e.g. ~/Downloads/... or ~/.simplex/files/...) lives outside the store,
    // so media tools and sandboxed workspaces would reject it.
    try {
      mediaType = await core.media.detectMime({ filePath: rawPath });
      const buffer = await readFile(rawPath);
      const saved = await core.channel.media.saveMediaBuffer(
        buffer,
        mediaType,
        "inbound",
        resolveSimplexMediaMaxBytes({
          cfg: pending.cfg,
          accountId: pending.account.accountId,
        }),
        params.fileName ?? path.basename(rawPath),
        rawPath
      );
      mediaPath = saved.path;
      mediaType = saved.contentType ?? mediaType;
    } catch (err) {
      pending.runtime.error?.(
        `[${params.accountId}] SimpleX inbound media staging failed, using raw path: ${String(err)}`
      );
      mediaPath = rawPath;
    }
  }
  await dispatchInbound({ pending, mediaPath, mediaType });
}

export function hasPendingFile(accountId: string, fileId: number): boolean {
  return pendingFiles.has(pendingKey(accountId, fileId));
}

export async function dispatchInbound(params: {
  pending: PendingInboundFile;
  mediaPath?: string;
  mediaType?: string;
}): Promise<void> {
  const { pending, mediaPath, mediaType } = params;
  const core = getSimplexRuntime();
  const liveReply = createSimplexLiveReplyController({
    cfg: pending.cfg,
    account: pending.account,
    chatRef: pending.chatRef,
    replyToId: pending.replyToId,
    logError: (message) => pending.runtime.error?.(`[${pending.account.accountId}] ${message}`),
  });
  const ctxPayload = {
    ...pending.ctxPayload,
    MediaPath: mediaPath,
    MediaPaths: mediaPath ? [mediaPath] : undefined,
    MediaType: mediaType,
    MediaUrl: mediaPath,
  };

  await core.channel.session.recordInboundSession({
    storePath: pending.storePath,
    sessionKey: (ctxPayload as { SessionKey?: string }).SessionKey ?? pending.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      pending.runtime.error?.(`simplex: failed updating session meta: ${String(err)}`);
    },
  });

  pending.statusSink?.({ lastInboundAt: Date.now() });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: pending.cfg,
    dispatcherOptions: {
      beforeDeliver: (payload) => payload,
      deliver: async (payload, info) => {
        const hasMedia =
          Boolean(payload.mediaUrl) ||
          (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0);
        if (!payload.text && !hasMedia) {
          return;
        }
        if (!pending.account.enabled || !pending.account.configured) {
          pending.runtime.error?.(
            `[${pending.account.accountId}] SimpleX reply skipped: account not ready (enabled=${pending.account.enabled}, configured=${pending.account.configured})`
          );
          return;
        }
        const livePayload: SimplexLiveReplyPayload = {
          text: payload.text,
          mediaUrl: payload.mediaUrl,
          mediaUrls: payload.mediaUrls,
          audioAsVoice: payload.audioAsVoice,
          replyToId: pending.replyToId,
        };
        if (info.kind === "final") {
          if (await liveReply.finalize(livePayload)) {
            pending.statusSink?.({ lastOutboundAt: Date.now() });
            return;
          }
        } else if (await liveReply.updatePartial(livePayload)) {
          pending.statusSink?.({ lastOutboundAt: Date.now() });
          return;
        }
        await pending.sendPayload(payload);
        pending.statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err) => {
        pending.runtime.error?.(
          `[${pending.account.accountId}] SimpleX reply failed: ${String(err)}`
        );
      },
    },
    replyOptions: {
      disableBlockStreaming: liveReply.enabled
        ? true
        : typeof pending.account.config.blockStreaming === "boolean"
          ? !pending.account.config.blockStreaming
          : undefined,
      onPartialReply: liveReply.enabled
        ? async (payload) => {
            await liveReply.updatePartial({
              text: payload.text,
              mediaUrls: payload.mediaUrls,
              replyToId: pending.replyToId,
            });
          }
        : undefined,
    },
  });
}
