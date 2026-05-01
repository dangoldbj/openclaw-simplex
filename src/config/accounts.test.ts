import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import {
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

  it("merges node connection config across base and account", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
          connection: {
            displayName: "Base",
            connectTimeoutMs: 4111,
          },
          accounts: {
            alpha: {
              connection: {
                connectTimeoutMs: 5225,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "alpha" });
    expect(account.mode).toBe("node");
    expect(account.config.connection?.displayName).toBe("Base");
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

  it("defaults meaningful connection config to node runtime mode", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            dbFilePrefix: "~/.openclaw/simplex/openclaw-simplex",
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.mode).toBe("node");
    expect(account.configured).toBe(true);
    expect(account.dbFilePrefix).toBe("~/.openclaw/simplex/openclaw-simplex");
  });

  it("derives named account node database prefixes", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            ops: {
              connection: {
                displayName: "Ops",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "ops" });
    expect(account.mode).toBe("node");
    expect(account.dbFilePrefix).toBe("~/.openclaw/simplex/openclaw-simplex-ops");
  });

  it("treats missing channel config as unconfigured", () => {
    const cfg = { channels: {} } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(false);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(false);
  });

  it("treats explicit node connection config as configured", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            displayName: "OpenClaw SimpleX",
          },
        },
      },
    } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(true);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(true);
  });
});
