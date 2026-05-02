import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatApi } from "../../types/simplex.js";

const clientMock = vi.hoisted(() => ({
  constructed: 0,
  reset() {
    this.constructed = 0;
  },
}));

vi.mock("./client.js", () => ({
  SimplexClient: class {
    constructor() {
      clientMock.constructed += 1;
    }
    async connect() {}
    async close() {}
    async withApi<T>(fn: (api: SimplexChatApi) => Promise<T>) {
      return await fn({ source: "constructed" } as unknown as SimplexChatApi);
    }
  },
}));

import type { SimplexClient } from "./client.js";
import {
  getActiveSimplexClient,
  registerActiveSimplexClient,
  unregisterActiveSimplexClient,
  withSimplexApi,
} from "./transport.js";

const registeredAccounts: Array<{ account: ResolvedSimplexAccount; client: SimplexClient }> = [];

function account(accountId = "default"): ResolvedSimplexAccount {
  const dbFilePrefix = `/tmp/openclaw-simplex-${accountId}`;
  return accountWithDb(accountId, dbFilePrefix);
}

function accountWithDb(accountId: string, dbFilePrefix: string): ResolvedSimplexAccount {
  return {
    accountId,
    name: accountId,
    enabled: true,
    configured: true,
    mode: "node",
    dbFilePrefix,
    config: {
      dbFilePrefix,
    },
  };
}

function activeClient(source: string): SimplexClient {
  return {
    async connect() {},
    async close() {},
    async withApi<T>(fn: (api: SimplexChatApi) => Promise<T>) {
      return await fn({ source } as unknown as SimplexChatApi);
    },
  } as SimplexClient;
}

describe("simplex runtime transport", () => {
  afterEach(() => {
    for (const registered of registeredAccounts) {
      unregisterActiveSimplexClient(registered.account, registered.client);
    }
    registeredAccounts.length = 0;
    clientMock.reset();
  });

  it("prefers the active monitor client for shared API calls", async () => {
    const cfg = account("alpha");
    const client = activeClient("active");
    registeredAccounts.push({ account: cfg, client });
    await registerActiveSimplexClient(cfg, client);

    const result = await withSimplexApi({
      account: cfg,
      run: async (api) => (api as unknown as { source: string }).source,
    });

    expect(result).toBe("active");
    expect(clientMock.constructed).toBe(0);
  });

  it("reuses an active monitor client for another account with the same runtime database", async () => {
    const dbFilePrefix = "/tmp/openclaw-simplex-shared";
    const monitored = accountWithDb("alpha", dbFilePrefix);
    const alias = accountWithDb("alias", dbFilePrefix);
    const client = activeClient("active");
    registeredAccounts.push({ account: monitored, client });
    await registerActiveSimplexClient(monitored, client);

    const result = await withSimplexApi({
      account: alias,
      run: async (api) => (api as unknown as { source: string }).source,
    });

    expect(result).toBe("active");
    expect(clientMock.constructed).toBe(0);
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
});
