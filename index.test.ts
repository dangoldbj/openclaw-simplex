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

vi.mock("./src/simplex-ws-client.js", () => ({
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

import type { PluginRuntime } from "openclaw/plugin-sdk";
import plugin from "./index.js";
import setupEntry from "./setup-entry.js";

const simplexConfiguredChannel = {
  channels: {
    simplex: {
      connection: {
        mode: "managed",
        cliPath: "simplex-chat",
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

function setupHandlers(
  config: Record<string, unknown> = {},
  registrationMode: "full" | "setup-only" | "setup-runtime" = "full"
): Map<string, Handler> {
  const methods = new Map<string, Handler>();
  plugin.register({
    id: "simplex",
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
    registerTool: () => {},
    registerHook: () => {},
    registerHttpRoute: () => {},
    registerCli: () => {},
    registerService: () => {},
    registerProvider: () => {},
    registerSpeechProvider: () => {},
    registerMediaUnderstandingProvider: () => {},
    registerImageGenerationProvider: () => {},
    registerWebSearchProvider: () => {},
    registerInteractiveHandler: () => {},
    onConversationBindingResolved: () => {},
    registerContextEngine: () => {},
    registerMemoryPromptSection: () => {},
    registerCommand: () => {},
    on: () => {},
    resolvePath: (value: string) => value,
  });
  return methods;
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
          channels: { simplex: { running: false } },
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
          channels: { simplex: { running: true } },
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
          channels: { simplex: { running: true } },
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
        simplex: {
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
          channels: { simplex: { running: true } },
          channelAccounts: { simplex: { ops: { running: true } } },
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
