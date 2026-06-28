import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";

const clientMock = vi.hoisted(() => ({
  constructed: 0,
  instances: [] as Array<{
    connected: number;
    closed: number;
  }>,
  reset() {
    this.constructed = 0;
    this.instances.length = 0;
  },
}));

vi.mock("./client.js", () => ({
  SimplexClient: class {
    source = "constructed";
    state = { connected: 0, closed: 0 };
    constructor() {
      clientMock.constructed += 1;
      clientMock.instances.push(this.state);
    }
    async connect() {
      this.state.connected += 1;
    }
    async close() {
      this.state.closed += 1;
    }
  },
}));

import type { SimplexClient } from "./client.js";
import {
  getActiveSimplexClient,
  registerActiveSimplexClient,
  SimplexNativeCoreUnavailableError,
  unregisterActiveSimplexClient,
  withSimplexClient,
} from "./transport.js";

const registeredAccounts: Array<{ account: ResolvedSimplexAccount; client: SimplexClient }> = [];
type TestSimplexClient = SimplexClient & { source: string };

function account(
  accountId = "default",
  wsUrl = `ws://127.0.0.1:5225/${accountId}`,
  commandTimeoutMs?: number
): ResolvedSimplexAccount {
  return {
    accountId,
    name: accountId,
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl,
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: {
      connection: { wsUrl, commandTimeoutMs },
    },
  };
}

function nativeAccount(
  accountId = "native",
  filePrefix = `/tmp/${accountId}`
): ResolvedSimplexAccount {
  return {
    accountId,
    name: accountId,
    enabled: true,
    configured: true,
    mode: "native",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    db: { filePrefix },
    config: { connection: { mode: "native", db: { filePrefix } } },
  };
}

function activeClient(source: string): TestSimplexClient {
  return {
    source,
    async connect() {},
    async close() {},
  } as TestSimplexClient;
}

describe("simplex runtime transport", () => {
  afterEach(() => {
    for (const registered of registeredAccounts) {
      unregisterActiveSimplexClient(registered.account, registered.client);
    }
    registeredAccounts.length = 0;
    clientMock.reset();
  });

  it("prefers the active monitor client for runtime calls", async () => {
    const cfg = account("alpha");
    const client = activeClient("active");
    registeredAccounts.push({ account: cfg, client });
    await registerActiveSimplexClient(cfg, client);

    const result = await withSimplexClient({
      account: cfg,
      run: async (runtimeClient) => (runtimeClient as TestSimplexClient).source,
    });

    expect(result).toBe("active");
    expect(clientMock.constructed).toBe(0);
  });

  it("reuses an active monitor client for another account with the same WebSocket URL", async () => {
    const wsUrl = "ws://127.0.0.1:5225";
    const monitored = account("alpha", wsUrl);
    const alias = account("alias", wsUrl);
    const client = activeClient("active");
    registeredAccounts.push({ account: monitored, client });
    await registerActiveSimplexClient(monitored, client);

    const result = await withSimplexClient({
      account: alias,
      run: async (runtimeClient) => (runtimeClient as TestSimplexClient).source,
    });

    expect(result).toBe("active");
    expect(clientMock.constructed).toBe(0);
  });

  it("does not reuse an active monitor client with a different command timeout", async () => {
    const wsUrl = "ws://127.0.0.1:5225";
    const monitored = account("alpha", wsUrl, 20_000);
    const alias = account("alias", wsUrl, 5_000);
    const client = activeClient("active");
    registeredAccounts.push({ account: monitored, client });
    await registerActiveSimplexClient(monitored, client);

    const result = await withSimplexClient({
      account: alias,
      run: async (runtimeClient) => (runtimeClient as TestSimplexClient).source,
    });

    expect(result).toBe("constructed");
    expect(clientMock.constructed).toBe(1);
  });

  it("does not unregister a newer active client with an older handle", async () => {
    const cfg = account("gamma");
    const oldClient = activeClient("old");
    const newClient = activeClient("new");
    registeredAccounts.push(
      { account: cfg, client: oldClient },
      { account: cfg, client: newClient }
    );
    await registerActiveSimplexClient(cfg, oldClient);
    await registerActiveSimplexClient(cfg, newClient);

    unregisterActiveSimplexClient(cfg, oldClient);

    expect(getActiveSimplexClient("gamma")).toBe(newClient);
  });

  it("closes transient clients created for one-shot runtime calls", async () => {
    const cfg = account("delta");

    const result = await withSimplexClient({
      account: cfg,
      run: async (runtimeClient) => (runtimeClient as TestSimplexClient).source,
    });

    expect(result).toBe("constructed");
    expect(clientMock.constructed).toBe(1);
    expect(clientMock.instances[0]).toMatchObject({ connected: 1, closed: 1 });
  });

  it("closes transient clients when the runtime call fails", async () => {
    const cfg = account("epsilon");

    await expect(
      withSimplexClient({
        account: cfg,
        run: async () => {
          throw new Error("runtime command failed");
        },
      })
    ).rejects.toThrow("runtime command failed");

    expect(clientMock.constructed).toBe(1);
    expect(clientMock.instances[0]).toMatchObject({ connected: 1, closed: 1 });
  });

  it("refuses to open a transient core for native mode without an active client", async () => {
    const cfg = nativeAccount("native-guard");

    await expect(
      withSimplexClient({ account: cfg, run: async () => "ran" })
    ).rejects.toBeInstanceOf(SimplexNativeCoreUnavailableError);

    // Critically, it must NOT construct a second embedded core.
    expect(clientMock.constructed).toBe(0);
  });

  it("uses the registered active client for native mode instead of a new core", async () => {
    const cfg = nativeAccount("native-active");
    const client = activeClient("active-native");
    registeredAccounts.push({ account: cfg, client });
    await registerActiveSimplexClient(cfg, client);

    const result = await withSimplexClient({
      account: cfg,
      run: async (runtimeClient) => (runtimeClient as TestSimplexClient).source,
    });

    expect(result).toBe("active-native");
    expect(clientMock.constructed).toBe(0);
  });
});
