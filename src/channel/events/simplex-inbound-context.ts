import type {
  BuildChannelInboundEventContextParams,
  ChannelInboundEnvelopeInput,
} from "openclaw/plugin-sdk/channel-inbound";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { SimplexChatContext } from "../../types/events.js";

type SimplexAgentRoute = {
  agentId: string;
  sessionKey: string;
  accountId: string;
  dmScope?: BuildChannelInboundEventContextParams["route"]["dmScope"];
};

/**
 * Inbound facts for one SimpleX message, kept unfinalized until dispatch:
 * an attachment may still be downloading, and its media facts (or an
 * unavailable notice) have to go through the host's context builder too.
 */
export type SimplexInboundEvent = BuildChannelInboundEventContextParams;

export function buildSimplexInboundEvent(params: {
  context: SimplexChatContext;
  route: SimplexAgentRoute;
  buildEnvelope: (input: ChannelInboundEnvelopeInput) => string;
  rawBody: string;
  dmPeerId: string;
  currentMessageId?: number;
  effectiveWasMentioned?: boolean;
  commandAuthorized?: boolean;
}): SimplexInboundEvent {
  const {
    context,
    route,
    buildEnvelope,
    rawBody,
    dmPeerId,
    currentMessageId,
    effectiveWasMentioned,
    commandAuthorized,
  } = params;
  const isGroup = context.chatType === "group";

  const fromLabel = isGroup
    ? `group:${context.chatId}`
    : context.senderName || `contact:${context.senderId ?? "unknown"}`;

  const conversationId = isGroup
    ? `${SIMPLEX_CHANNEL_ID}:group:${context.chatId}`
    : `${SIMPLEX_CHANNEL_ID}:${dmPeerId}`;

  const messageId = currentMessageId !== undefined ? String(currentMessageId) : undefined;

  return {
    channel: SIMPLEX_CHANNEL_ID,
    accountId: route.accountId,
    messageId,
    from: conversationId,
    sender: { id: context.senderId, name: context.senderName },
    conversation: {
      kind: isGroup ? "group" : "direct",
      id: isGroup ? String(context.chatId) : dmPeerId,
      label: fromLabel,
    },
    route: {
      agentId: route.agentId,
      dmScope: route.dmScope,
      accountId: route.accountId,
      routeSessionKey: route.sessionKey,
    },
    reply: { to: conversationId },
    message: {
      body: buildEnvelope({ channel: "SimpleX", from: fromLabel, body: rawBody }),
      rawBody,
    },
    access: {
      commands: { authorized: commandAuthorized === true },
      ...(isGroup && effectiveWasMentioned !== undefined
        ? { mentions: { canDetectMention: true, wasMentioned: effectiveWasMentioned } }
        : {}),
    },
    // The conversation label is the stable `group:<id>`; the group's display
    // name rides separately, as it did before the host builder owned the shape.
    extra: {
      ...(isGroup ? { GroupSubject: context.chatLabel } : {}),
      CurrentMessageId: messageId,
    },
  };
}
