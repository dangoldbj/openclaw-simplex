import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import {
  assertUniqueNativeDbPrefixes,
  hasMeaningfulSimplexConfig,
  listSimplexAccountIds,
  resolveDefaultSimplexAccountId,
  resolveSimplexAccount,
} from "./accounts.js";

describe("simplex accounts", () => {
  it("returns default account id when unconfigured", () => {
    const cfg = { channels: {} } as OpenClawConfig;
    expect(listSimplexAccountIds(cfg)).toEqual([DEFAULT_ACCOUNT_ID]);
  });

  it("sorts configured account ids", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            beta: {},
            alpha: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(listSimplexAccountIds(cfg)).toEqual(["alpha", "beta"]);
  });

  it("resolves default account id when present", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            default: {},
            alpha: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveDefaultSimplexAccountId(cfg)).toBe(DEFAULT_ACCOUNT_ID);
  });

  it("falls back to first configured account id when default missing", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            gamma: {},
            beta: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveDefaultSimplexAccountId(cfg)).toBe("beta");
  });

  it("merges WebSocket runtime config across base and account", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
          connection: {
            wsHost: "127.0.0.1",
            wsPort: 5225,
            connectTimeoutMs: 4111,
          },
          accounts: {
            alpha: {
              connection: {
                wsPort: 6225,
                connectTimeoutMs: 5225,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "alpha" });
    expect(account.mode).toBe("external");
    expect(account.wsUrl).toBe("ws://127.0.0.1:6225");
    expect(account.config.connection?.connectTimeoutMs).toBe(5225);
    expect(account.enabled).toBe(true);
  });

  it("honors disabled flags", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: false,
          accounts: {
            alpha: {},
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveSimplexAccount({ cfg, accountId: "alpha" }).enabled).toBe(false);

    const cfg2 = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
          accounts: {
            alpha: {
              enabled: false,
            },
          },
        },
      },
    } as OpenClawConfig;
    expect(resolveSimplexAccount({ cfg: cfg2, accountId: "alpha" }).enabled).toBe(false);
  });

  it("uses explicit wsUrl for external runtime", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            wsUrl: "ws://127.0.0.1:5225",
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.mode).toBe("external");
    expect(account.configured).toBe(true);
    expect(account.wsUrl).toBe("ws://127.0.0.1:5225");
  });

  it("defaults the native db file prefix under the state dir and counts as configured", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            mode: "native",
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.mode).toBe("native");
    expect(account.configured).toBe(true);
    expect(account.db?.filePrefix).toMatch(/[/\\]simplex[/\\]default$/);
  });

  it("honors an explicit native db file prefix and encryption key", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            mode: "native",
            db: { filePrefix: "/data/simplex-bot", encryptionKey: "secret" },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.db?.filePrefix).toBe("/data/simplex-bot");
    expect(account.db?.encryptionKey).toBe("secret");
  });

  it("rejects two native accounts sharing the same db file prefix", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            a: { connection: { mode: "native", db: { filePrefix: "/data/shared" } } },
            b: { connection: { mode: "native", db: { filePrefix: "/data/shared" } } },
          },
        },
      },
    } as OpenClawConfig;
    expect(() => assertUniqueNativeDbPrefixes(cfg)).toThrow(/unique db\.filePrefix/);
  });

  it("allows native accounts with distinct (and defaulted) db file prefixes", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            a: { connection: { mode: "native", db: { filePrefix: "/data/a" } } },
            b: { connection: { mode: "native" } }, // defaults to <state>/simplex/b
          },
        },
      },
    } as OpenClawConfig;
    expect(() => assertUniqueNativeDbPrefixes(cfg)).not.toThrow();
  });

  it("does not treat an empty channel section as configured", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.configured).toBe(false);
    expect(account.wsUrl).toBe("ws://127.0.0.1:5225");
  });

  it("treats missing channel config as unconfigured", () => {
    const cfg = { channels: {} } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(false);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(false);
  });

  it("supports nested connection config", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            wsHost: "localhost",
            wsPort: 7001,
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.configured).toBe(true);
    expect(account.wsUrl).toBe("ws://localhost:7001");
  });
});
