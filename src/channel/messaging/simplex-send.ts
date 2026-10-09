import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { MessageReceipt } from "openclaw/plugin-sdk/channel-outbound";
import { getChannelStreamingConfigObject } from "openclaw/plugin-sdk/channel-streaming-config";
import { SIMPLEX_TEXT_CHUNK_LIMIT } from "../../constants.js";
import { describeError } from "../../errors.js";
import { parseSimplexNumericId, resolveSimplexChatItemId } from "../../simplex/runtime/api.js";
import { withSimplexClient } from "../../simplex/runtime/transport.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexComposedMessage, SimplexMsgContent } from "../../types/simplex.js";
import { buildComposedMessages, type SimplexOutboundQuote } from "../media/simplex-media.js";

export async function sendSimplexComposedMessages(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  ttl?: number;
  liveMessage?: boolean;
  send: SimplexSendFn;
}): Promise<{ messageId?: string; receipt?: MessageReceipt }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const chatItems = await params.send({
    chatRef: params.chatRef,
    composedMessages: params.composedMessages,
    ttl: params.ttl,
    liveMessage: params.liveMessage,
  });
  // Staged outbound files are reclaimed by the outbound-files reaper once the
  // runtime has had time to read them; the send returning does not mean the
  // async upload is done, so we deliberately do not delete them here.
  const messageId = resolveSimplexChatItemId(chatItems[0]);
  return {
    messageId,
    receipt: messageId
      ? {
          primaryPlatformMessageId: messageId,
          platformMessageIds: [messageId],
          parts: [
            {
              platformMessageId: messageId,
              kind: "text",
              index: 0,
              raw: { messageId, chatId: params.chatRef },
            },
          ],
          sentAt: Date.now(),
          raw: [{ messageId, chatId: params.chatRef }],
        }
      : undefined,
  };
}

type SimplexSendFn = (params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  ttl?: number;
  liveMessage?: boolean;
}) => Promise<unknown[]>;

type SimplexQuoteLookup = (params: {
  chatRef: string;
  chatItemId: number;
}) => Promise<SimplexMsgContent | undefined>;

/**
 * `simplex-chat` embeds the quoted item's content in the reply, so the quote's
 * size must be known before the reply can be sized. A quote that cannot be
 * looked up is dropped: the reply matters more than its reference.
 */
async function resolveOutboundQuote(params: {
  account: ResolvedSimplexAccount;
  chatRef: string;
  replyToId?: string | number | null;
  lookupQuote?: SimplexQuoteLookup;
  logError?: (message: string) => void;
}): Promise<SimplexOutboundQuote | undefined> {
  if (params.replyToId === undefined || params.replyToId === null) {
    return undefined;
  }
  const itemId = parseSimplexNumericId(params.replyToId);
  if (itemId === null) {
    return undefined;
  }
  const lookup: SimplexQuoteLookup =
    params.lookupQuote ??
    ((target) =>
      withSimplexClient({
        account: params.account,
        run: (client) => client.getChatItemContent(target),
      }));
  try {
    const content = await lookup({ chatRef: params.chatRef, chatItemId: itemId });
    if (content) {
      return { itemId, content };
    }
    params.logError?.(`SimpleX reply sent unquoted: item ${itemId} not found`);
  } catch (err) {
    params.logError?.(`SimpleX reply sent unquoted: ${describeError(err)}`);
  }
  return undefined;
}

function sendWithAccountClient(account: ResolvedSimplexAccount): SimplexSendFn {
  return ({ chatRef, composedMessages, ttl, liveMessage }) =>
    withSimplexClient({
      account,
      run: (client) => client.sendMessages({ chatRef, composedMessages, ttl, liveMessage }),
    });
}

export async function buildAndSendSimplexMessages(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  chatRef: string;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
  replyToId?: string | number | null;
  ttl?: number;
  liveMessage?: boolean;
  send?: SimplexSendFn;
  lookupQuote?: SimplexQuoteLookup;
  logError?: (message: string) => void;
}): Promise<{ messageId?: string; receipt?: MessageReceipt }> {
  const quote = await resolveOutboundQuote(params);
  const composedMessages = await buildComposedMessages({
    cfg: params.cfg,
    accountId: params.account.accountId,
    text: params.text,
    mediaUrl: params.mediaUrl,
    mediaUrls: params.mediaUrls,
    audioAsVoice: params.audioAsVoice,
    quote,
  });
  return await sendSimplexComposedMessages({
    chatRef: params.chatRef,
    composedMessages,
    ttl: params.ttl ?? params.account.config.messageTtlSeconds,
    liveMessage: params.liveMessage,
    send: params.send ?? sendWithAccountClient(params.account),
  });
}

export type SimplexLiveReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
  replyToId?: string | number | null;
};

// Mirrors OpenClaw's draft-stream defaults, which are not exported to plugins.
const DEFAULT_DRAFT_STREAM_MIN = 200;
const DEFAULT_DRAFT_STREAM_MAX = 800;

export type SimplexLiveStreamingConfig = {
  enabled: boolean;
  throttleMs: number;
  minChars: number;
  maxChars?: number;
  breakPreference?: "paragraph" | "newline" | "sentence";
  wordBoundary: boolean;
};

/**
 * Live-draft chunking is dual-read. When OpenClaw's canonical chunk config is
 * present, chunk sizes and break points come from it. Otherwise the original
 * `streaming.*` behavior and defaults are kept, so existing installs are
 * unaffected.
 *
 * `throttleMs` and `nativeTransport` stay plugin-owned: the host chunking model
 * has no equivalent for either.
 */
export function resolveSimplexLiveStreamingConfig(
  account: ResolvedSimplexAccount
): SimplexLiveStreamingConfig {
  const streaming = account.config.streaming;
  const enabled = streaming?.nativeTransport === true;
  const throttleMs = streaming?.throttleMs ?? 2000;
  const wordBoundary = streaming?.wordBoundary ?? true;

  // `account.config` is the merged channel+account view, so it is the single
  // source of truth here. The canonical `streaming.preview.chunk` wins over the
  // plugin's flat `draftChunk`; this is the precedence the SDK's
  // `resolveChannelStreamingPreviewChunk` applied before 2026.8 dropped it.
  const chunk =
    getChannelStreamingConfigObject(account.config)?.preview?.chunk ?? account.config.draftChunk;
  if (chunk) {
    const maxChars = Math.min(
      Math.max(1, Math.floor(chunk.maxChars ?? DEFAULT_DRAFT_STREAM_MAX)),
      SIMPLEX_TEXT_CHUNK_LIMIT
    );
    return {
      enabled,
      throttleMs,
      minChars: Math.min(
        Math.max(1, Math.floor(chunk.minChars ?? DEFAULT_DRAFT_STREAM_MIN)),
        maxChars
      ),
      maxChars,
      breakPreference:
        chunk.breakPreference === "newline" || chunk.breakPreference === "sentence"
          ? chunk.breakPreference
          : "paragraph",
      wordBoundary,
    };
  }

  return {
    enabled,
    throttleMs,
    minChars: streaming?.minChars ?? 24,
    wordBoundary,
  };
}

function trimToWordBoundary(text: string): string {
  const trimmed = text.trimEnd();
  if (trimmed.length !== text.length) {
    return trimmed;
  }
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, lastSpace).trimEnd();
}

const BREAK_MARKERS: Record<
  NonNullable<SimplexLiveStreamingConfig["breakPreference"]>,
  string[]
> = {
  paragraph: ["\n\n"],
  newline: ["\n"],
  sentence: [". ", "! ", "? ", ".\n", "!\n", "?\n"],
};

/**
 * Trims a partial draft back to the last configured break point so the live
 * message does not flicker mid-sentence. Falls back to word-boundary trimming
 * when no break point has been reached yet.
 */
function trimToBreakPreference(
  text: string,
  breakPreference: NonNullable<SimplexLiveStreamingConfig["breakPreference"]>
): string {
  const trimmed = text.trimEnd();
  let cut = -1;
  for (const marker of BREAK_MARKERS[breakPreference]) {
    cut = Math.max(cut, trimmed.lastIndexOf(marker) + marker.length);
  }
  return cut > 0 ? trimmed.slice(0, cut).trimEnd() : trimToWordBoundary(trimmed);
}

function payloadHasMedia(payload: SimplexLiveReplyPayload): boolean {
  return Boolean(
    payload.mediaUrl ||
      (Array.isArray(payload.mediaUrls) && payload.mediaUrls.some((url) => Boolean(url)))
  );
}

function renderLiveText(
  text: string,
  params: {
    final?: boolean;
    wordBoundary: boolean;
    maxChars?: number;
    breakPreference?: SimplexLiveStreamingConfig["breakPreference"];
  }
): string {
  // `maxChars` caps the live draft only. A final reply is never truncated here;
  // outbound chunking owns splitting it.
  const capped =
    !params.final && params.maxChars !== undefined && text.length > params.maxChars
      ? text.slice(0, params.maxChars)
      : text;
  if (params.final) {
    return capped.trimEnd();
  }
  if (params.breakPreference) {
    return trimToBreakPreference(capped, params.breakPreference);
  }
  return params.wordBoundary ? trimToWordBoundary(capped) : capped.trimEnd();
}

export function createSimplexLiveReplyController(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  chatRef: string;
  replyToId?: string | number | null;
  now?: () => number;
  logError?: (message: string) => void;
}): {
  readonly enabled: boolean;
  readonly messageId: string | undefined;
  updatePartial: (payload: SimplexLiveReplyPayload) => Promise<boolean>;
  finalize: (payload: SimplexLiveReplyPayload) => Promise<boolean>;
} {
  const live = resolveSimplexLiveStreamingConfig(params.account);
  const now = params.now ?? Date.now;
  let messageId: string | undefined;
  let lastSent = "";
  let lastSentAt = 0;
  let failed = false;

  // Only the first part goes out live: it is the item later edits update. The
  // final edit re-plans the whole text and sends whatever no longer fits.
  async function sendInitial(text: string): Promise<boolean> {
    const quote = await resolveOutboundQuote({
      account: params.account,
      chatRef: params.chatRef,
      replyToId: params.replyToId,
      logError: params.logError,
    });
    const [first] = await buildComposedMessages({
      cfg: params.cfg,
      accountId: params.account.accountId,
      text,
      quote,
    });
    if (!first) {
      return false;
    }
    const sent = await sendSimplexComposedMessages({
      chatRef: params.chatRef,
      composedMessages: [first],
      ttl: params.account.config.messageTtlSeconds,
      liveMessage: true,
      send: sendWithAccountClient(params.account),
    });
    messageId = sent.messageId;
    lastSent = text;
    lastSentAt = now();
    return Boolean(messageId);
  }

  async function editLive(text: string, final: boolean): Promise<boolean> {
    if (!messageId) {
      return false;
    }
    const existingMessageId = messageId;
    const [updatedMessage, ...overflow] = await buildComposedMessages({
      cfg: params.cfg,
      accountId: params.account.accountId,
      text,
    });
    if (!updatedMessage) {
      return false;
    }
    await withSimplexClient({
      account: params.account,
      run: (client) =>
        client.editMessage({
          chatRef: params.chatRef,
          messageId: existingMessageId,
          updatedMessage,
          liveMessage: !final,
        }),
    });
    if (final && overflow.length > 0) {
      await sendSimplexComposedMessages({
        chatRef: params.chatRef,
        composedMessages: overflow,
        ttl: params.account.config.messageTtlSeconds,
        send: sendWithAccountClient(params.account),
      });
    }
    lastSent = text;
    lastSentAt = now();
    return true;
  }

  async function updateText(text: string, options: { final?: boolean } = {}): Promise<boolean> {
    if (!live.enabled || failed) {
      return false;
    }
    const rendered = renderLiveText(text, {
      final: options.final,
      wordBoundary: live.wordBoundary,
      maxChars: live.maxChars,
      breakPreference: live.breakPreference,
    });
    if (!rendered) {
      return true;
    }
    const currentTime = now();
    if (!options.final) {
      if (!messageId && rendered.length < live.minChars) {
        return true;
      }
      if (
        messageId &&
        Math.abs(rendered.length - lastSent.length) < live.minChars &&
        currentTime - lastSentAt < live.throttleMs
      ) {
        return true;
      }
    }
    try {
      return messageId
        ? await editLive(rendered, options.final === true)
        : await sendInitial(rendered);
    } catch (err) {
      failed = true;
      params.logError?.(`SimpleX live reply update failed: ${String(err)}`);
      return false;
    }
  }

  return {
    get enabled() {
      return live.enabled;
    },
    get messageId() {
      return messageId;
    },
    updatePartial: async (payload) => {
      if (!live.enabled || payloadHasMedia(payload)) {
        return false;
      }
      const text = payload.text?.trimEnd();
      if (!text) {
        return true;
      }
      return await updateText(text);
    },
    finalize: async (payload) => {
      if (!live.enabled || payloadHasMedia(payload) || !messageId) {
        return false;
      }
      const text = payload.text?.trimEnd();
      if (!text) {
        return false;
      }
      return await updateText(text, { final: true });
    },
  };
}
