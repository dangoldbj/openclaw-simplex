import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { renderMessagePresentationFallbackText } from "openclaw/plugin-sdk/interactive-runtime";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import { assertSimplexOutboundAccountReady } from "./simplex-common.js";
import { buildAndSendSimplexMessages } from "./simplex-send.js";

export function buildSimplexOutbound(
  registry: SimplexClientRegistry
): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["outbound"]> {
  return {
    deliveryMode: "direct" as const,
    textChunkLimit: 4000,
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
  };
}
