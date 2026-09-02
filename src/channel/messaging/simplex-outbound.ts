import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { createAttachedChannelResultAdapter } from "openclaw/plugin-sdk/channel-send-result";
import { renderMessagePresentationFallbackText } from "openclaw/plugin-sdk/interactive-runtime";
import { normalizePollInput } from "openclaw/plugin-sdk/media-runtime";
import { chunkTextForOutbound } from "openclaw/plugin-sdk/text-chunking";
import { assertSimplexAccountReady, resolveSimplexAccount } from "../../config/accounts.js";
import { SIMPLEX_CHANNEL_ID, SIMPLEX_TEXT_CHUNK_LIMIT } from "../../constants.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { parseSimplexExplicitTarget } from "../shared/simplex-common.js";
import { buildAndSendSimplexMessages } from "./simplex-send.js";

export function renderSimplexPollText(params: {
  question: string;
  options: string[];
  maxSelections: number;
  durationSeconds?: number;
  durationHours?: number;
}): string {
  const lines = [params.question, ""];
  for (let i = 0; i < params.options.length; i += 1) {
    const option = params.options[i];
    if (!option) {
      continue;
    }
    lines.push(`${i + 1}. ${option}`);
  }

  const multiSelect = params.maxSelections > 1;
  lines.push("");
  lines.push(
    multiSelect
      ? `Reply with up to ${params.maxSelections} option numbers or labels.`
      : "Reply with the option number or label."
  );

  if (typeof params.durationSeconds === "number") {
    lines.push(`Poll window: ${params.durationSeconds} seconds.`);
  } else if (typeof params.durationHours === "number") {
    lines.push(
      `Poll window: ${params.durationHours} hour${params.durationHours === 1 ? "" : "s"}.`
    );
  }

  return lines.join("\n").trim();
}

function normalizeOutboundChatRef(to: string): string {
  const parsed = parseSimplexExplicitTarget(to);
  if (parsed) {
    return parsed.to;
  }
  const trimmed = to.trim();
  if (!trimmed || trimmed.startsWith("@") || trimmed.startsWith("#") || trimmed.startsWith("!")) {
    return trimmed;
  }
  return `@${trimmed}`;
}

export function buildSimplexOutbound(): NonNullable<
  ChannelPlugin<ResolvedSimplexAccount>["outbound"]
> {
  return {
    deliveryMode: "direct" as const,
    // `textChunkLimit` alone does nothing: the dispatcher only splits when a
    // `chunker` is set too.
    textChunkLimit: SIMPLEX_TEXT_CHUNK_LIMIT,
    chunker: chunkTextForOutbound,
    chunkerMode: "markdown",
    shouldTreatDeliveredTextAsVisible: ({ kind, text }) =>
      kind === "block" && typeof text === "string" && text.trim().length > 0,
    preferFinalAssistantVisibleText: true,
    presentationCapabilities: {
      supported: true,
      buttons: false,
      selects: false,
      context: true,
      divider: true,
    },
    renderPresentation: ({ payload, presentation }) => ({
      ...payload,
      text: renderMessagePresentationFallbackText({
        text: payload.text,
        presentation,
      }),
    }),
    sendPayload: async ({ cfg, to, payload, accountId, replyToId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexAccountReady(account);
      const chatRef = normalizeOutboundChatRef(to);
      const result = await buildAndSendSimplexMessages({
        cfg,
        account,
        chatRef,
        text: payload.text,
        mediaUrls: payload.mediaUrls,
        mediaUrl: payload.mediaUrl,
        audioAsVoice: payload.audioAsVoice,
        replyToId,
      });
      return {
        channel: SIMPLEX_CHANNEL_ID,
        messageId: result.messageId ?? "unknown",
        chatId: chatRef,
        meta: {
          receipt: result.receipt,
          ttl: account.config.messageTtlSeconds ?? null,
        },
      };
    },
    ...createAttachedChannelResultAdapter({
      channel: SIMPLEX_CHANNEL_ID,
      sendText: async ({ cfg, to, text, accountId, replyToId }) => {
        const account = resolveSimplexAccount({ cfg, accountId });
        assertSimplexAccountReady(account);
        const chatRef = normalizeOutboundChatRef(to);
        const result = await buildAndSendSimplexMessages({
          cfg,
          account,
          chatRef,
          text,
          replyToId,
        });
        return {
          messageId: result.messageId ?? "unknown",
          chatId: chatRef,
          meta: { receipt: result.receipt, ttl: account.config.messageTtlSeconds ?? null },
        };
      },
      sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId }) => {
        if (!mediaUrl) {
          return { messageId: "empty", chatId: to };
        }
        const account = resolveSimplexAccount({ cfg, accountId });
        assertSimplexAccountReady(account);
        const chatRef = normalizeOutboundChatRef(to);
        const result = await buildAndSendSimplexMessages({
          cfg,
          account,
          chatRef,
          text,
          mediaUrl,
          replyToId,
        });
        return {
          messageId: result.messageId ?? "unknown",
          chatId: chatRef,
          meta: {
            mediaUrl,
            receipt: result.receipt,
            ttl: account.config.messageTtlSeconds ?? null,
          },
        };
      },
      sendPoll: async ({ cfg, to, poll, accountId }) => {
        const account = resolveSimplexAccount({ cfg, accountId });
        assertSimplexAccountReady(account);
        const chatRef = normalizeOutboundChatRef(to);
        const normalized = normalizePollInput(poll);
        const text = renderSimplexPollText(normalized);
        const result = await buildAndSendSimplexMessages({ cfg, account, chatRef, text });
        return {
          messageId: result.messageId ?? "unknown",
          chatId: chatRef,
          meta: { receipt: result.receipt, ttl: account.config.messageTtlSeconds ?? null },
        };
      },
    }),
  };
}
