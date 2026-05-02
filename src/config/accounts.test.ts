import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import {
  hasMeaningfulSimplexConfig,
  listSimplexAccountIds,
  resolveDefaultSimplexAccountId,
  resolveSimplexAccount,
  SIMPLEX_CLI_DEFAULT_DB_PREFIX,
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

  it("merges node runtime config across base and account", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
          displayName: "Base",
          connectTimeoutMs: 4111,
          dbFilePrefix: "/tmp/simplex-base",
          accounts: {
            alpha: {
              connectTimeoutMs: 5225,
              dbFilePrefix: "/tmp/simplex-alpha",
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "alpha" });
    expect(account.mode).toBe("node");
    expect(account.config.displayName).toBe("Base");
    expect(account.config.connectTimeoutMs).toBe(5225);
    expect(account.dbFilePrefix).toBe("/tmp/simplex-alpha");
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

  it("uses explicit dbFilePrefix for node runtime storage", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          dbFilePrefix: "~/.simplex/openclaw-bot",
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.mode).toBe("node");
    expect(account.configured).toBe(true);
    expect(account.dbFilePrefix).toBe("~/.simplex/openclaw-bot");
  });

  it("uses the SimpleX CLI default database prefix for the default account", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.configured).toBe(true);
    expect(account.dbFilePrefix).toBe(SIMPLEX_CLI_DEFAULT_DB_PREFIX);
  });

  it("does not derive database prefixes for named accounts", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            ops: {
              displayName: "Ops",
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "ops" });
    expect(account.mode).toBe("node");
    expect(account.configured).toBe(false);
    expect(account.dbFilePrefix).toBeUndefined();
  });

  it("allows named accounts to inherit an explicit base database prefix", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          dbFilePrefix: "/tmp/simplex-shared",
          accounts: {
            ops: {
              displayName: "Ops",
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "ops" });
    expect(account.configured).toBe(true);
    expect(account.dbFilePrefix).toBe("/tmp/simplex-shared");
  });

  it("treats missing channel config as unconfigured", () => {
    const cfg = { channels: {} } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(false);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(false);
  });

  it("treats the default account as configured when the channel section exists", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          displayName: "OpenClaw SimpleX",
        },
      },
    } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(true);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(true);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).dbFilePrefix).toBe(
      SIMPLEX_CLI_DEFAULT_DB_PREFIX
    );
  });

  it("still reads legacy nested connection config before migration", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            dbFilePrefix: "/tmp/legacy-simplex",
            displayName: "Legacy",
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "default" });
    expect(account.configured).toBe(true);
    expect(account.dbFilePrefix).toBe("/tmp/legacy-simplex");
    expect(account.config.displayName).toBe("Legacy");
  });
});
