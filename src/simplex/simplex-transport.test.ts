import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../types/config.js";
import type { SimplexChatApi } from "../types/simplex.js";

const nodeClientMock = vi.hoisted(() => ({
  constructed: 0,
  reset() {
    this.constructed = 0;
  },
}));

vi.mock("./simplex-node-client.js", () => ({
  SimplexNodeClient: class {
    constructor() {
      nodeClientMock.constructed += 1;
    }
    async connect() {}
    async close() {}
    async withApi<T>(fn: (api: SimplexChatApi) => Promise<T>) {
      return await fn({ source: "constructed" } as unknown as SimplexChatApi);
    }
  },
}));

import type { SimplexNodeClient } from "./simplex-node-client.js";
import {
  activeSimplexNodeClients,
  registerActiveSimplexNodeClient,
  unregisterActiveSimplexNodeClient,
  withSimplexApi,
} from "./simplex-transport.js";

function account(accountId = "default"): ResolvedSimplexAccount {
  return {
    accountId,
    name: accountId,
    enabled: true,
    configured: true,
    mode: "node",
    dbFilePrefix: `/tmp/openclaw-simplex-${accountId}`,
    config: {
      dbFilePrefix: `/tmp/openclaw-simplex-${accountId}`,
    },
  };
}

function activeClient(source: string): SimplexNodeClient {
  return {
    async connect() {},
    async close() {},
    async withApi<T>(fn: (api: SimplexChatApi) => Promise<T>) {
      return await fn({ source } as unknown as SimplexChatApi);
    },
  } as SimplexNodeClient;
}

describe("simplex runtime transport", () => {
  afterEach(() => {
    activeSimplexNodeClients.clear();
    nodeClientMock.reset();
  });

  it("prefers the active monitor client for shared API calls", async () => {
    const cfg = account("alpha");
    await registerActiveSimplexNodeClient(cfg, activeClient("active"));

    const result = await withSimplexApi({
      account: cfg,
      run: async (api) => (api as unknown as { source: string }).source,
    });

    expect(result).toBe("active");
    expect(nodeClientMock.constructed).toBe(0);
  });

  it("does not unregister a newer active client with an older handle", async () => {
    const cfg = account("gamma");
    const oldClient = activeClient("old");
    const newClient = activeClient("new");
    await registerActiveSimplexNodeClient(cfg, oldClient);
    await registerActiveSimplexNodeClient(cfg, newClient);

    unregisterActiveSimplexNodeClient(cfg, oldClient);

    expect(activeSimplexNodeClients.get("gamma")).toBe(newClient);
  });
});
