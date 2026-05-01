import { describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatContext } from "../../types/events.js";
import { resolveSimplexInboundAccess } from "./simplex-inbound-auth.js";

function account(config: ResolvedSimplexAccount["config"] = {}): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "node",
    dbFilePrefix: "/tmp/simplex",
    config,
  };
}

function directContext(): SimplexChatContext {
  return {
    chatType: "direct",
    chatId: 42,
    chatLabel: "Alice",
    senderId: "42",
    senderName: "Alice",
  };
}

function groupContext(): SimplexChatContext {
  return {
    chatType: "group",
    chatId: 7,
    chatLabel: "Ops",
    senderId: "42",
    senderName: "Alice",
  };
}

function runtimeCore(
  params: {
    storeAllowFrom?: string[];
    shouldComputeAuth?: boolean;
    commandAuthorized?: boolean;
    mentioned?: boolean;
    controlCommand?: boolean;
  } = {}
) {
  return {
    channel: {
      commands: {
        shouldComputeCommandAuthorized: vi.fn(() => params.shouldComputeAuth ?? false),
        resolveCommandAuthorizedFromAuthorizers: vi.fn(() => params.commandAuthorized ?? false),
        shouldHandleTextCommands: vi.fn(() => true),
        isControlCommandMessage: vi.fn(() => params.controlCommand ?? false),
      },
      pairing: {
        readAllowFromStore: vi.fn(async () => params.storeAllowFrom ?? []),
        upsertPairingRequest: vi.fn(async () => ({ code: "123456", created: true })),
        buildPairingReply: vi.fn(() => "pairing reply"),
      },
      mentions: {
        buildMentionRegexes: vi.fn(() => [/agent/i]),
        matchesMentionPatterns: vi.fn(() => params.mentioned ?? false),
      },
      text: {
        hasControlCommand: vi.fn(() => params.controlCommand ?? false),
      },
    },
  };
}

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
} as never;

describe("resolveSimplexInboundAccess", () => {
  it("creates a pairing request and rejects unknown DMs in pairing mode", async () => {
    const core = runtimeCore();
    const replyToPairingRequest = vi.fn(async () => undefined);

    const result = await resolveSimplexInboundAccess({
      account: account({ dmPolicy: "pairing" }),
      cfg: {},
      runtime,
      core: core as never,
      context: directContext(),
      rawBody: "hello",
      normalizedSenderId: "42",
      routeAgentId: "agent",
      replyToPairingRequest,
    });

    expect(result.allowed).toBe(false);
    expect(core.channel.pairing.upsertPairingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ id: "42", accountId: "default" })
    );
    expect(replyToPairingRequest).toHaveBeenCalledWith("pairing reply");
  });

  it("allows allowlisted group messages when mention policy is satisfied", async () => {
    const result = await resolveSimplexInboundAccess({
      account: account({ groupPolicy: "allowlist", groupAllowFrom: ["group:7"] }),
      cfg: {},
      runtime,
      core: runtimeCore({ mentioned: true }) as never,
      context: groupContext(),
      rawBody: "@agent status",
      normalizedSenderId: "42",
      routeAgentId: "agent",
      replyToPairingRequest: vi.fn(),
    });

    expect(result).toMatchObject({
      allowed: true,
      effectiveWasMentioned: true,
    });
  });

  it("rejects unauthorized group control commands", async () => {
    const result = await resolveSimplexInboundAccess({
      account: account({ groupPolicy: "open" }),
      cfg: { commands: { useAccessGroups: true } },
      runtime,
      core: runtimeCore({
        shouldComputeAuth: true,
        commandAuthorized: false,
        mentioned: true,
        controlCommand: true,
      }) as never,
      context: groupContext(),
      rawBody: "!approve",
      normalizedSenderId: "42",
      routeAgentId: "agent",
      replyToPairingRequest: vi.fn(),
    });

    expect(result.allowed).toBe(false);
    expect(result.commandAuthorized).toBe(false);
  });
});
