import { afterEach, describe, expect, it, vi } from "vitest";

type MockResponse = { [key: string]: unknown };

let mockSendResponses: MockResponse[] = [{ resp: { type: "ok" } }];
let sentCommands: string[] = [];

function setMockResponse(next: MockResponse | MockResponse[]): void {
  mockSendResponses = Array.isArray(next) ? [...next] : [next];
}

function getCommands(): string[] {
  return [...sentCommands];
}

function resetMockState(): void {
  sentCommands = [];
  mockSendResponses = [{ resp: { type: "ok" } }];
}

function nextMockPayload(): MockResponse {
  const next = mockSendResponses.shift();
  return (next && "resp" in next ? next.resp : (next ?? { type: "ok" })) as MockResponse;
}

function extractMockLink(value: unknown): string | null {
  if (typeof value === "string") {
    return value.match(/simplex:\/\/\S+/)?.[0] ?? null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  return extractMockLink(record.output) ?? extractMockLink(record.message);
}

function mockContactLink(link: string | null): MockResponse {
  return {
    connShortLink: link ?? "simplex://address-mock",
  };
}

const qrMocks = vi.hoisted(() => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,mock-base64"),
}));

vi.mock("./src/simplex/simplex-node-client.js", () => ({
  SimplexNodeClient: class {
    async connect() {}
    async withApi<T>(fn: (api: Record<string, unknown>) => Promise<T>) {
      const api = {
        apiGetActiveUser: vi.fn(async () => ({ userId: 1 })),
        apiCreateLink: vi.fn(
          async () => extractMockLink(nextMockPayload()) ?? "simplex://invite-mock"
        ),
        apiGetUserAddress: vi.fn(async () => mockContactLink(extractMockLink(nextMockPayload()))),
        apiCreateUserAddress: vi.fn(async () =>
          mockContactLink(extractMockLink(nextMockPayload()))
        ),
        apiDeleteUserAddress: vi.fn(async () => undefined),
        apiListContacts: vi.fn(async () => [nextMockPayload()]),
        apiSendMessages: vi.fn(async () => [{ chatItem: { meta: { itemId: 1 } } }]),
        apiReceiveFile: vi.fn(async () => ({ chatItem: { meta: { itemId: 1 } } })),
        apiCancelFile: vi.fn(async () => undefined),
      };
      return await fn(api);
    }
    async close() {}
  },
}));

vi.mock("qrcode", () => ({
  toDataURL: qrMocks.toDataURL,
}));

import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import plugin from "./index.js";
import setupEntry from "./setup-entry.js";
import { simplexPlugin } from "./src/channel/plugin.js";

const simplexConfiguredChannel = {
  channels: {
    "openclaw-simplex": {
      connection: {},
    },
  },
};

const noopLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

type Handler = (ctx: {
  params?: Record<string, unknown>;
  respond: (ok: boolean, payload?: unknown, err?: unknown) => void;
}) => Promise<void>;

type BeforeToolCallHook = (event: { toolName: string; params: Record<string, unknown> }) => unknown;

function setupRegistration(
  config: Record<string, unknown> = {},
  registrationMode: "full" | "setup-only" | "setup-runtime" = "full"
): {
  methods: Map<string, Handler>;
  methodScopes: Map<string, unknown>;
  tools: string[];
  toolDefinitions: Map<string, Record<string, unknown>>;
  cliCommands: string[][];
  hooks: Array<{ events: string | string[]; handler: unknown }>;
} {
  const methods = new Map<string, Handler>();
  const methodScopes = new Map<string, unknown>();
  const tools: string[] = [];
  const toolDefinitions = new Map<string, Record<string, unknown>>();
  const cliCommands: string[][] = [];
  const hooks: Array<{ events: string | string[]; handler: unknown }> = [];
  const api: OpenClawPluginApi = {
    id: "openclaw-simplex",
    name: "SimpleX",
    description: "test",
    version: "0",
    source: "test",
    registrationMode,
    config,
    pluginConfig: {},
    runtime: {} as PluginRuntime,
    logger: noopLogger,
    registerChannel: () => {},
    registerGatewayMethod: (method, handler, opts) => {
      methods.set(method, handler as Handler);
      methodScopes.set(method, opts?.scope ?? null);
    },
    registerTool: (tool, opts) => {
      const registeredName = opts?.name;
      if (registeredName) {
        tools.push(registeredName);
        const definition = typeof tool === "function" ? tool({}) : tool;
        if (definition && !Array.isArray(definition)) {
          toolDefinitions.set(registeredName, definition as unknown as Record<string, unknown>);
        }
      }
    },
    registerHook: (events, handler) => {
      hooks.push({ events, handler });
    },
    registerHttpRoute: () => {},
    registerCli: (_registrar, opts) => {
      const commands = Array.isArray(opts?.commands) ? opts.commands : [];
      cliCommands.push([...commands]);
    },
    registerReload: () => {},
    registerNodeHostCommand: () => {},
    registerSecurityAuditCollector: () => {},
    registerService: () => {},
    registerGatewayDiscoveryService: () => {},
    registerCliBackend: () => {},
    registerTextTransforms: () => {},
    registerConfigMigration: () => {},
    registerMigrationProvider: () => {},
    registerAutoEnableProbe: () => {},
    registerProvider: () => {},
    registerSpeechProvider: () => {},
    registerRealtimeTranscriptionProvider: () => {},
    registerRealtimeVoiceProvider: () => {},
    registerMediaUnderstandingProvider: () => {},
    registerImageGenerationProvider: () => {},
    registerVideoGenerationProvider: () => {},
    registerMusicGenerationProvider: () => {},
    registerWebFetchProvider: () => {},
    registerWebSearchProvider: () => {},
    registerInteractiveHandler: () => {},
    onConversationBindingResolved: () => {},
    registerContextEngine: () => {},
    registerCompactionProvider: () => {},
    registerAgentHarness: () => {},
    registerCodexAppServerExtensionFactory: () => {},
    registerAgentToolResultMiddleware: () => {},
    registerSessionExtension: () => {},
    enqueueNextTurnInjection: async (injection) => ({
      enqueued: false,
      id: "mock-injection",
      sessionKey: injection.sessionKey,
    }),
    registerTrustedToolPolicy: () => {},
    registerToolMetadata: () => {},
    registerControlUiDescriptor: () => {},
    registerRuntimeLifecycle: () => {},
    registerAgentEventSubscription: () => {},
    setRunContext: () => false,
    getRunContext: () => undefined,
    clearRunContext: () => {},
    registerSessionSchedulerJob: () => undefined,
    registerDetachedTaskRuntime: () => {},
    registerMemoryCapability: () => {},
    registerMemoryPromptSupplement: () => {},
    registerMemoryCorpusSupplement: () => {},
    registerMemoryFlushPlan: () => {},
    registerMemoryRuntime: () => {},
    registerMemoryEmbeddingProvider: () => {},
    registerMemoryPromptSection: () => {},
    registerCommand: () => {},
    on: (hookName, handler) => {
      hooks.push({ events: hookName, handler });
    },
    resolvePath: (value: string) => value,
  };
  plugin.register(api);
  return { methods, methodScopes, tools, toolDefinitions, cliCommands, hooks };
}

function setupHandlers(
  config: Record<string, unknown> = {},
  registrationMode: "full" | "setup-only" | "setup-runtime" = "full"
): Map<string, Handler> {
  return setupRegistration(config, registrationMode).methods;
}

function assertBeforeToolCallHook(handler: unknown): asserts handler is BeforeToolCallHook {
  if (typeof handler !== "function") {
    throw new Error("before_tool_call hook is not callable");
  }
}

function setupHandler(method: string, config: Record<string, unknown> = {}): Handler {
  const methods = setupHandlers(config);
  const handler = methods.get(method);
  if (!handler) {
    throw new Error(`${method} handler not registered`);
  }
  return handler;
}

describe("plugin entry registration modes", () => {
  it("registers gateway methods only in full mode", () => {
    const full = setupRegistration(simplexConfiguredChannel, "full");
    const setupOnly = setupRegistration(simplexConfiguredChannel, "setup-only");
    const setupRuntime = setupRegistration(simplexConfiguredChannel, "setup-runtime");

    expect(full.methods.has("simplex.invite.create")).toBe(true);
    expect(full.methods.has("simplex.invite.list")).toBe(true);
    expect(full.methods.has("simplex.invite.revoke")).toBe(true);
    expect(full.methodScopes).toEqual(
      new Map([
        ["simplex.invite.create", "operator.write"],
        ["simplex.invite.list", "operator.read"],
        ["simplex.invite.revoke", "operator.admin"],
      ])
    );
    expect(setupOnly.methods.size).toBe(0);
    expect(setupRuntime.methods.size).toBe(0);
  });

  it("exports the setup entry plugin surface", () => {
    expect(setupEntry).toEqual({ plugin: expect.any(Object) });
    expect(setupEntry.plugin).toBeTruthy();
  });

  it("registers simplex tools and approval hook in full mode", () => {
    const full = setupRegistration(simplexConfiguredChannel, "full");

    expect(full.tools).toEqual(
      expect.arrayContaining([
        "simplex_invite_create",
        "simplex_invite_list",
        "simplex_invite_revoke",
        "simplex_group_add_participant",
        "simplex_group_remove_participant",
        "simplex_group_leave",
      ])
    );
    expect(full.hooks.some((entry) => entry.events === "before_tool_call")).toBe(true);
  });

  it("exposes approval capability for same-chat approvals", () => {
    expect(simplexPlugin.approvalCapability).toBeTruthy();
    expect(typeof simplexPlugin.approvalCapability?.authorizeActorAction).toBe("function");
    expect(simplexPlugin.commands).toEqual({
      skipWhenConfigEmpty: true,
    });
    expect(simplexPlugin.heartbeat).toBeTruthy();
    expect(typeof simplexPlugin.heartbeat?.checkReady).toBe("function");
    expect(typeof simplexPlugin.heartbeat?.resolveRecipients).toBe("function");
  });

  it("marks destructive simplex tools as owner-only", () => {
    const full = setupRegistration(simplexConfiguredChannel, "full");

    expect(full.toolDefinitions.get("simplex_invite_revoke")?.ownerOnly).toBe(true);
    expect(full.toolDefinitions.get("simplex_group_remove_participant")?.ownerOnly).toBe(true);
    expect(full.toolDefinitions.get("simplex_group_leave")?.ownerOnly).toBe(true);
    expect(full.toolDefinitions.get("simplex_group_add_participant")?.ownerOnly).toBeUndefined();
  });

  it("registers the simplex CLI only once in full mode", () => {
    const full = setupRegistration(simplexConfiguredChannel, "full");

    expect(full.cliCommands).toEqual([["openclaw-simplex", "simplex"]]);
  });
});

describe("simplex channel SDK metadata", () => {
  it("parses, infers, and formats SimpleX explicit targets", () => {
    expect(simplexPlugin.messaging?.parseExplicitTarget?.({ raw: "simplex:@alice" })).toEqual({
      to: "@alice",
      chatType: "direct",
    });
    expect(
      simplexPlugin.messaging?.parseExplicitTarget?.({ raw: "openclaw-simplex:#ops" })
    ).toEqual({
      to: "#ops",
      chatType: "group",
    });
    expect(simplexPlugin.messaging?.parseExplicitTarget?.({ raw: "group:ops" })).toEqual({
      to: "#ops",
      chatType: "group",
    });
    expect(simplexPlugin.messaging?.parseExplicitTarget?.({ raw: "contact:alice" })).toEqual({
      to: "@alice",
      chatType: "direct",
    });
    expect(simplexPlugin.messaging?.parseExplicitTarget?.({ raw: "alice" })).toBeNull();
    expect(simplexPlugin.messaging?.inferTargetChatType?.({ to: "#ops" })).toBe("group");
    expect(simplexPlugin.messaging?.inferTargetChatType?.({ to: "@alice" })).toBe("direct");
    expect(
      simplexPlugin.messaging?.formatTargetDisplay?.({
        target: "openclaw-simplex:group:ops",
        kind: "group",
      })
    ).toBe("#ops");
  });

  it("exposes SimpleX-specific message tool guidance", () => {
    expect(
      simplexPlugin.agentPrompt?.messageToolHints?.({ cfg: simplexConfiguredChannel })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("@contactId"),
        expect.stringContaining('action="poll"'),
        expect.stringContaining("upload-file"),
      ])
    );
    expect(
      simplexPlugin.agentPrompt?.reactionGuidance?.({
        cfg: simplexConfiguredChannel,
        accountId: "default",
      })
    ).toEqual({
      level: "minimal",
      channelLabel: "SimpleX",
    });
    expect(simplexPlugin.actions?.messageActionTargetAliases).toMatchObject({
      send: { aliases: expect.arrayContaining(["chatRef", "chatId"]) },
      addParticipant: { aliases: expect.arrayContaining(["groupId", "chatRef", "chatId"]) },
    });
    expect(
      simplexPlugin.actions?.extractToolSend?.({
        args: { action: "upload-file", chatRef: "#ops", mediaUrl: "/tmp/file.txt" },
      })
    ).toMatchObject({ to: "#ops" });
  });
});

describe("simplex channel config and allowlist adapters", () => {
  it("supports shared account enable and delete config hooks", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {},
          allowFrom: ["@base"],
          accounts: {
            ops: {
              connection: { dbFilePrefix: "~/.openclaw/simplex/openclaw-simplex-ops" },
              allowFrom: ["@ops"],
            },
          },
        },
      },
    } as OpenClawConfig;

    const disabledDefault = simplexPlugin.config.setAccountEnabled?.({
      cfg,
      accountId: "default",
      enabled: false,
    });
    expect(disabledDefault?.channels?.["openclaw-simplex"]?.enabled).toBe(false);

    const disabledOps = simplexPlugin.config.setAccountEnabled?.({
      cfg,
      accountId: "ops",
      enabled: false,
    });
    expect(disabledOps?.channels?.["openclaw-simplex"]?.accounts?.ops?.enabled).toBe(false);

    const deletedOps = simplexPlugin.config.deleteAccount?.({
      cfg,
      accountId: "ops",
    });
    expect(deletedOps?.channels?.["openclaw-simplex"]?.accounts?.ops).toBeUndefined();

    const deletedDefault = simplexPlugin.config.deleteAccount?.({
      cfg,
      accountId: "default",
    });
    expect(deletedDefault?.channels?.["openclaw-simplex"]?.connection).toBeUndefined();
    expect(deletedDefault?.channels?.["openclaw-simplex"]?.allowFrom).toBeUndefined();
    expect(deletedDefault?.channels?.["openclaw-simplex"]?.accounts?.ops).toBeDefined();
  });

  it("reads and edits SimpleX DM/group allowlists through the shared adapter", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          dmPolicy: "allowlist",
          allowFrom: ["@base"],
          groupPolicy: "allowlist",
          groupAllowFrom: ["group:base"],
          accounts: {
            ops: {
              dmPolicy: "allowlist",
              allowFrom: ["@ops"],
              groupPolicy: "allowlist",
              groupAllowFrom: ["group:ops"],
            },
          },
        },
      },
    } as OpenClawConfig;

    expect(await simplexPlugin.allowlist?.readConfig?.({ cfg, accountId: "ops" })).toEqual({
      dmAllowFrom: ["@ops"],
      dmPolicy: "allowlist",
      groupAllowFrom: ["group:ops"],
      groupOverrides: undefined,
      groupPolicy: "allowlist",
    });
    expect(simplexPlugin.allowlist?.supportsScope?.({ scope: "dm" })).toBe(true);
    expect(simplexPlugin.allowlist?.supportsScope?.({ scope: "group" })).toBe(true);

    const parsedConfig = structuredClone(cfg) as unknown as Record<string, unknown>;
    const addResult = await simplexPlugin.allowlist?.applyConfigEdit?.({
      cfg,
      parsedConfig,
      accountId: "ops",
      scope: "group",
      action: "add",
      entry: "#NewGroup",
    });

    expect(addResult).toMatchObject({
      kind: "ok",
      changed: true,
      pathLabel: "channels.openclaw-simplex.accounts.ops.groupAllowFrom",
    });
    expect(
      (
        parsedConfig.channels as {
          "openclaw-simplex": { accounts: { ops: { groupAllowFrom: string[] } } };
        }
      )["openclaw-simplex"].accounts.ops.groupAllowFrom
    ).toEqual(["group:ops", "#NewGroup"]);

    const removeResult = await simplexPlugin.allowlist?.applyConfigEdit?.({
      cfg,
      parsedConfig,
      accountId: "ops",
      scope: "dm",
      action: "remove",
      entry: "simplex:@ops",
    });
    expect(removeResult).toMatchObject({
      kind: "ok",
      changed: true,
      pathLabel: "channels.openclaw-simplex.accounts.ops.allowFrom",
    });
    expect(
      (
        parsedConfig.channels as {
          "openclaw-simplex": { accounts: { ops: { allowFrom?: string[] } } };
        }
      )["openclaw-simplex"].accounts.ops.allowFrom
    ).toBeUndefined();
  });
});

describe("simplex approval hook", () => {
  it("requires approval for destructive simplex tools", () => {
    const full = setupRegistration(simplexConfiguredChannel, "full");
    const beforeToolCall = full.hooks.find((entry) => entry.events === "before_tool_call");
    expect(beforeToolCall).toBeDefined();
    if (!beforeToolCall) {
      throw new Error("before_tool_call hook not registered");
    }
    assertBeforeToolCallHook(beforeToolCall.handler);

    expect(
      beforeToolCall.handler({
        toolName: "simplex_group_remove_participant",
        params: {
          accountId: "default",
          groupId: "group-1",
          memberId: "123",
        },
      })
    ).toMatchObject({
      requireApproval: {
        title: "Approve SimpleX admin action",
        severity: "warning",
      },
    });

    expect(
      beforeToolCall.handler({
        toolName: "simplex_group_add_participant",
        params: {
          accountId: "default",
          groupId: "group-1",
          contactId: "123",
        },
      })
    ).toBeUndefined();
  });
});

describe("simplex invite gateway", () => {
  afterEach(() => {
    resetMockState();
    vi.clearAllMocks();
  });

  it("rejects invalid mode", async () => {
    const handler = setupHandler("simplex.invite.create", simplexConfiguredChannel);
    const respond = vi.fn();
    await handler({
      params: { mode: "bad" },
      respond,
    });
    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok] = firstCall;
    expect(ok).toBe(false);
  });

  it("returns a simplex invite link + qr data", async () => {
    setMockResponse({
      resp: {
        type: "ok",
        message: "Use simplex://invite123 or https://example.com",
      },
    });

    const handler = setupHandler("simplex.invite.create", simplexConfiguredChannel);
    const respond = vi.fn();
    await handler({
      params: { mode: "connect" },
      respond,
    });

    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok, payload] = firstCall;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      link: "simplex://invite123",
      qrDataUrl: "data:image/png;base64,mock-base64",
      mode: "connect",
    });
    expect(getCommands()).toEqual([]);
    expect(qrMocks.toDataURL).toHaveBeenCalledWith("simplex://invite123", expect.any(Object));
  });

  it("uses address mode to create or return an address link", async () => {
    setMockResponse({
      resp: {
        type: "ok",
        output: "simplex://address456",
      },
    });

    const handler = setupHandler("simplex.invite.create", simplexConfiguredChannel);
    const respond = vi.fn();
    await handler({
      params: { mode: "address" },
      respond,
    });

    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok, payload] = firstCall;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      link: "simplex://address456",
      mode: "address",
    });
    expect(getCommands()).toEqual([]);
  });

  it("lists address links and pending hints", async () => {
    setMockResponse([
      {
        resp: {
          type: "ok",
          output: "Address: simplex://address789",
        },
      },
      {
        resp: {
          type: "ok",
          output: "Pending contact request from Bob simplex://invite999",
        },
      },
    ]);

    const handler = setupHandler("simplex.invite.list", simplexConfiguredChannel);
    const respond = vi.fn();
    await handler({
      params: {},
      respond,
    });

    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok, payload] = firstCall;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      accountId: "default",
      addressLink: "simplex://address789",
      links: ["simplex://address789"],
      addressQrDataUrl: "data:image/png;base64,mock-base64",
    });
    expect((payload as { pendingHints?: string[] }).pendingHints).toEqual([]);
    expect(getCommands()).toEqual([]);
    expect(qrMocks.toDataURL).toHaveBeenCalledWith("simplex://address789", expect.any(Object));
  });

  it("revokes address link for selected account", async () => {
    const handler = setupHandler("simplex.invite.revoke", {
      channels: {
        "openclaw-simplex": {
          accounts: {
            ops: {
              connection: { dbFilePrefix: "~/.openclaw/simplex/openclaw-simplex-ops" },
            },
          },
        },
      },
    });
    const respond = vi.fn();
    await handler({
      params: { accountId: "ops" },
      respond,
    });

    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok, payload] = firstCall;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({ accountId: "ops" });
    expect(getCommands()).toEqual([]);
  });

  it("uses the configured default account when accountId is omitted", async () => {
    setMockResponse({
      resp: {
        type: "ok",
        output: "simplex://address999",
      },
    });

    const handler = setupHandler("simplex.invite.create", {
      channels: {
        "openclaw-simplex": {
          accounts: {
            ops: {
              connection: { dbFilePrefix: "~/.openclaw/simplex/openclaw-simplex-ops" },
            },
          },
        },
      },
    });
    const respond = vi.fn();
    await handler({
      params: { mode: "address" },
      respond,
    });

    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok, payload] = firstCall;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({
      accountId: "ops",
      mode: "address",
      link: "simplex://address999",
    });
  });
});
