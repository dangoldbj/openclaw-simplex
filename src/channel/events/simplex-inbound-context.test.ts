import { buildChannelInboundEventContext } from "openclaw/plugin-sdk/channel-inbound";
import { describe, expect, it, vi } from "vitest";
import type { SimplexChatContext } from "../../types/events.js";
import { buildSimplexInboundEvent } from "./simplex-inbound-context.js";

function groupContext(): SimplexChatContext {
  return {
    chatType: "group",
    chatId: 7,
    chatLabel: "Ops",
    senderId: "42",
    senderName: "Alice",
  };
}

describe("buildSimplexInboundEvent", () => {
  it("produces the same context fields the plugin carried before the host builder", () => {
    const buildEnvelope = vi.fn(({ body }: { body: string }) => `wrapped:${body}`);

    const event = buildSimplexInboundEvent({
      context: groupContext(),
      route: { agentId: "agent", accountId: "default", sessionKey: "simplex:group:7" },
      buildEnvelope,
      rawBody: "hello",
      dmPeerId: "42",
      currentMessageId: 99,
      effectiveWasMentioned: true,
      commandAuthorized: true,
    });

    expect(buildEnvelope).toHaveBeenCalledWith({
      channel: "SimpleX",
      from: "group:7",
      body: "hello",
    });
    expect(buildChannelInboundEventContext(event)).toMatchObject({
      Body: "wrapped:hello",
      BodyForAgent: "hello",
      RawBody: "hello",
      CommandBody: "hello",
      From: "openclaw-simplex:group:7",
      To: "openclaw-simplex:group:7",
      SessionKey: "simplex:group:7",
      AgentId: "agent",
      AccountId: "default",
      ChatType: "group",
      ConversationLabel: "group:7",
      GroupSubject: "Ops",
      SenderName: "Alice",
      SenderId: "42",
      Provider: "openclaw-simplex",
      Surface: "openclaw-simplex",
      MessageSid: "99",
      CurrentMessageId: "99",
      WasMentioned: true,
      CommandAuthorized: true,
      OriginatingChannel: "openclaw-simplex",
      OriginatingTo: "openclaw-simplex:group:7",
    });
  });

  it("labels a direct chat by sender and leaves group-only fields unset", () => {
    const event = buildSimplexInboundEvent({
      context: { chatType: "direct", chatId: 3, chatLabel: "Bob", senderId: "5" },
      route: { agentId: "agent", accountId: "default", sessionKey: "simplex:direct:5" },
      buildEnvelope: ({ body }) => body,
      rawBody: "hi",
      dmPeerId: "5",
      effectiveWasMentioned: true,
    });

    const ctx = buildChannelInboundEventContext(event);
    expect(ctx).toMatchObject({
      From: "openclaw-simplex:5",
      ChatType: "direct",
      ConversationLabel: "contact:5",
      CommandAuthorized: false,
    });
    expect(ctx.GroupSubject).toBeUndefined();
    expect(ctx.WasMentioned).toBeUndefined();
    expect(ctx.MessageSid).toBeUndefined();
  });
});
