import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatContext } from "../../types/events.js";
import { resolveSimplexInboundAccess, type SimplexInboundCore } from "./simplex-inbound-auth.js";

function account(config: ResolvedSimplexAccount["config"] = {}): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
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
): SimplexInboundCore {
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

const runtimeLog = vi.fn();
const runtime = {
  log: runtimeLog,
  error: vi.fn(),
  exit: vi.fn(),
} as RuntimeEnv;

describe("resolveSimplexInboundAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pairing request and rejects unknown DMs in pairing mode", async () => {
    const core = runtimeCore();
    const replyToPairingRequest = vi.fn(async () => undefined);

    const result = await resolveSimplexInboundAccess({
      account: account({ dmPolicy: "pairing" }),
      cfg: {},
      runtime,
      core,
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
      core: runtimeCore({ mentioned: true }),
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

  it("scopes mention pattern matching to the SimpleX group and account policy", async () => {
    const core = runtimeCore({ mentioned: true });
    const mentionPatterns = { mode: "deny" as const, denyIn: ["7"] };

    await resolveSimplexInboundAccess({
      account: account({
        groupPolicy: "allowlist",
        groupAllowFrom: ["group:7"],
        mentionPatterns,
      }),
      cfg: {},
      runtime,
      core,
      context: groupContext(),
      rawBody: "@agent status",
      normalizedSenderId: "42",
      routeAgentId: "agent",
      replyToPairingRequest: vi.fn(),
    });

    expect(core.channel.mentions.buildMentionRegexes).toHaveBeenCalledWith({}, "agent", {
      provider: "openclaw-simplex",
      conversationId: "7",
      providerPolicy: mentionPatterns,
    });
  });

  it("logs group id and sender details for allowlist drops", async () => {
    const result = await resolveSimplexInboundAccess({
      account: account({ groupPolicy: "allowlist", groupAllowFrom: ["group:99"] }),
      cfg: {},
      runtime,
      core: runtimeCore({ mentioned: true }),
      context: groupContext(),
      rawBody: "@agent status",
      normalizedSenderId: "42",
      routeAgentId: "agent",
      replyToPairingRequest: vi.fn(),
    });

    expect(result.allowed).toBe(false);
    expect(runtimeLog).toHaveBeenCalledWith(
      expect.stringContaining(
        'groupId=7 group="Ops" sender="42" senderName="Alice" reason=not-allowlisted'
      )
    );
  });

  it("rejects unauthorized group control commands", async () => {
    const result = await resolveSimplexInboundAccess({
      account: account({ groupPolicy: "open" }),
      cfg: {},
      runtime,
      core: runtimeCore({
        shouldComputeAuth: true,
        commandAuthorized: false,
        mentioned: true,
        controlCommand: true,
      }),
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
