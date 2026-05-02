import { describe, expect, it, vi } from "vitest";
import type { SimplexChatContext } from "../../types/events.js";
import { buildSimplexInboundDispatchContext } from "./simplex-inbound-context.js";

function groupContext(): SimplexChatContext {
  return {
    chatType: "group",
    chatId: 7,
    chatLabel: "Ops",
    senderId: "42",
    senderName: "Alice",
  };
}

function runtimeCore() {
  return {
    channel: {
      session: {
        resolveStorePath: vi.fn(() => "/tmp/session-store"),
        readSessionUpdatedAt: vi.fn(() => 123),
      },
      reply: {
        resolveEnvelopeFormatOptions: vi.fn(() => ({ enabled: true })),
        formatAgentEnvelope: vi.fn(({ body }) => `wrapped:${body}`),
        finalizeInboundContext: vi.fn((ctx) => ctx),
      },
    },
  };
}

describe("buildSimplexInboundDispatchContext", () => {
  it("builds a group inbound context with route and authorization metadata", () => {
    const core = runtimeCore();

    const result = buildSimplexInboundDispatchContext({
      core: core as never,
      cfg: {},
      context: groupContext(),
      route: {
        agentId: "agent",
        accountId: "default",
        sessionKey: "simplex:group:7",
      },
      rawBody: "hello",
      dmPeerId: "42",
      currentMessageId: 99,
      effectiveWasMentioned: true,
      commandAuthorized: true,
    });

    expect(result.storePath).toBe("/tmp/session-store");
    expect(result.sessionKey).toBe("simplex:group:7");
    expect(result.ctxPayload).toMatchObject({
      Body: "wrapped:hello",
      RawBody: "hello",
      From: "openclaw-simplex:group:7",
      To: "openclaw-simplex:group:7",
      AccountId: "default",
      ChatType: "group",
      ConversationLabel: "group:7",
      GroupSubject: "Ops",
      MessageSid: "99",
      CurrentMessageId: "99",
      WasMentioned: true,
      CommandAuthorized: true,
      OriginatingTo: "openclaw-simplex:group:7",
    });
    expect(core.channel.session.resolveStorePath).toHaveBeenCalledWith(undefined, {
      agentId: "agent",
    });
  });
});
