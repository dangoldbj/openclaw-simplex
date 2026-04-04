import { afterEach, describe, expect, it, vi } from "vitest";

type MockResponse = { [key: string]: unknown };

let mockSendResponses: MockResponse[] = [{ resp: { type: "ok" } }];
let sentCommands: string[] = [];

function setMockResponse(next: MockResponse | MockResponse[]): void {
  mockSendResponses = Array.isArray(next) ? [...next] : [next];
}

function getLastCommand(): string | null {
  return sentCommands[sentCommands.length - 1] ?? null;
}

function getCommands(): string[] {
  return [...sentCommands];
}

function resetMockState(): void {
  sentCommands = [];
  mockSendResponses = [{ resp: { type: "ok" } }];
}

const qrMocks = vi.hoisted(() => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,mock-base64"),
}));

vi.mock("./src/simplex/simplex-ws-client.js", () => ({
  SimplexWsClient: class {
    async connect() {}
    async sendCommand(cmd: string) {
      sentCommands.push(cmd);
      const next = mockSendResponses.shift();
      return next ?? { resp: { type: "ok" } };
    }
    async close() {}
  },
}));

vi.mock("qrcode", () => ({
  toDataURL: qrMocks.toDataURL,
}));

import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import plugin from "./index.js";
import setupEntry from "./setup-entry.js";

const simplexConfiguredChannel = {
  channels: {
    "openclaw-simplex": {
      connection: {
        wsUrl: "ws://127.0.0.1:5225",
      },
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
  context: {
    startChannel: (channel: string, accountId?: string) => Promise<void>;
    getRuntimeSnapshot: () => {
      channels?: Record<string, { running?: boolean }>;
      channelAccounts?: Record<string, Record<string, { running?: boolean }>>;
    };
  };
}) => Promise<void>;

type BeforeToolCallHook = (event: { toolName: string; params: Record<string, unknown> }) => unknown;

function setupRegistration(
  config: Record<string, unknown> = {},
  registrationMode: "full" | "setup-only" | "setup-runtime" = "full"
): {
  methods: Map<string, Handler>;
  tools: string[];
  hooks: Array<{ events: string | string[]; handler: unknown }>;
} {
  const methods = new Map<string, Handler>();
  const tools: string[] = [];
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
    registerGatewayMethod: (method, handler) => methods.set(method, handler as Handler),
    registerTool: (_tool, opts) => {
      const registeredName = opts?.name;
      if (registeredName) {
        tools.push(registeredName);
      }
    },
    registerHook: (events, handler) => {
      hooks.push({ events, handler });
    },
    registerHttpRoute: () => {},
    registerCli: () => {},
    registerService: () => {},
    registerProvider: () => {},
    registerSpeechProvider: () => {},
    registerMediaUnderstandingProvider: () => {},
    registerImageGenerationProvider: () => {},
    registerWebFetchProvider: () => {},
    registerWebSearchProvider: () => {},
    registerInteractiveHandler: () => {},
    onConversationBindingResolved: () => {},
    registerContextEngine: () => {},
    registerCliBackend: () => {},
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
  return { methods, tools, hooks };
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
    const full = setupHandlers(simplexConfiguredChannel, "full");
    const setupOnly = setupHandlers(simplexConfiguredChannel, "setup-only");
    const setupRuntime = setupHandlers(simplexConfiguredChannel, "setup-runtime");

    expect(full.has("simplex.invite.create")).toBe(true);
    expect(full.has("simplex.invite.list")).toBe(true);
    expect(full.has("simplex.invite.revoke")).toBe(true);
    expect(setupOnly.size).toBe(0);
    expect(setupRuntime.size).toBe(0);
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
      context: {
        startChannel: async () => {},
        getRuntimeSnapshot: () => ({ channels: {}, channelAccounts: {} }),
      },
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
      context: {
        startChannel: async () => {},
        getRuntimeSnapshot: () => ({
          channels: { "openclaw-simplex": { running: false } },
          channelAccounts: {},
        }),
      },
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
    expect(getLastCommand()).toBe("/c");
    expect(qrMocks.toDataURL).toHaveBeenCalledWith("simplex://invite123", expect.any(Object));
  });

  it("uses address mode to build invite command", async () => {
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
      context: {
        startChannel: async () => {},
        getRuntimeSnapshot: () => ({
          channels: { "openclaw-simplex": { running: true } },
          channelAccounts: {},
        }),
      },
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
    expect(getLastCommand()).toBe("/ad");
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
      context: {
        startChannel: async () => {},
        getRuntimeSnapshot: () => ({
          channels: { "openclaw-simplex": { running: true } },
          channelAccounts: {},
        }),
      },
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
      links: ["simplex://address789", "simplex://invite999"],
      addressQrDataUrl: "data:image/png;base64,mock-base64",
    });
    expect((payload as { pendingHints?: string[] }).pendingHints?.length).toBeGreaterThan(0);
    expect(getCommands()).toEqual(["/show_address", "/contacts"]);
    expect(qrMocks.toDataURL).toHaveBeenCalledWith("simplex://address789", expect.any(Object));
  });

  it("revokes address link for selected account", async () => {
    const handler = setupHandler("simplex.invite.revoke", {
      channels: {
        "openclaw-simplex": {
          accounts: {
            ops: {
              connection: { wsUrl: "ws://127.0.0.1:7777", mode: "external" },
            },
          },
        },
      },
    });
    const respond = vi.fn();
    await handler({
      params: { accountId: "ops" },
      respond,
      context: {
        startChannel: async () => {},
        getRuntimeSnapshot: () => ({
          channels: { "openclaw-simplex": { running: true } },
          channelAccounts: { "openclaw-simplex": { ops: { running: true } } },
        }),
      },
    });

    const firstCall = respond.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error("missing response call");
    }
    const [ok, payload] = firstCall;
    expect(ok).toBe(true);
    expect(payload).toMatchObject({ accountId: "ops" });
    expect(getLastCommand()).toBe("/delete_address");
  });
});
