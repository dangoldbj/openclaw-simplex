import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { renderMessagePresentationFallbackText } from "openclaw/plugin-sdk/interactive-runtime";
import { normalizePollInput } from "openclaw/plugin-sdk/poll-runtime";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import { assertSimplexOutboundAccountReady } from "./simplex-common.js";
import { buildAndSendSimplexMessages } from "./simplex-send.js";

function renderSimplexPollText(params: {
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

export function buildSimplexOutbound(
  registry: SimplexClientRegistry
): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["outbound"]> {
  return {
    deliveryMode: "direct" as const,
    textChunkLimit: 4000,
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
    sendPayload: async ({ cfg, to, payload, accountId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexOutboundAccountReady(account);
      const result = await buildAndSendSimplexMessages({
        registry,
        cfg,
        account,
        chatRef: to,
        text: payload.text,
        mediaUrls: payload.mediaUrls,
        mediaUrl: payload.mediaUrl,
        audioAsVoice: payload.audioAsVoice,
      });
      return {
        channel: SIMPLEX_CHANNEL_ID,
        messageId: result.messageId ?? "unknown",
        chatId: to,
      };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexOutboundAccountReady(account);
      const result = await buildAndSendSimplexMessages({
        registry,
        cfg,
        account,
        chatRef: to,
        text,
      });
      return {
        channel: SIMPLEX_CHANNEL_ID,
        messageId: result.messageId ?? "unknown",
        chatId: to,
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
      if (!mediaUrl) {
        return { channel: SIMPLEX_CHANNEL_ID, messageId: "empty", chatId: to };
      }
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexOutboundAccountReady(account);
      const result = await buildAndSendSimplexMessages({
        registry,
        cfg,
        account,
        chatRef: to,
        text,
        mediaUrl,
      });
      return {
        channel: SIMPLEX_CHANNEL_ID,
        messageId: result.messageId ?? "unknown",
        chatId: to,
        meta: { mediaUrl },
      };
    },
    sendPoll: async ({ cfg, to, poll, accountId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexOutboundAccountReady(account);
      const normalized = normalizePollInput(poll);
      const text = renderSimplexPollText(normalized);
      const result = await buildAndSendSimplexMessages({
        registry,
        cfg,
        account,
        chatRef: to,
        text,
      });
      return {
        channel: SIMPLEX_CHANNEL_ID,
        messageId: result.messageId ?? "unknown",
        chatId: to,
      };
    },
  };
}
