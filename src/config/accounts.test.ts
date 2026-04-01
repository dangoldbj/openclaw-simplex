import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/core";
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

  it("merges connection config across base and account", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          enabled: true,
          connection: {
            wsHost: "base-host",
            wsPort: 4111,
          },
          accounts: {
            alpha: {
              connection: {
                wsPort: 5225,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const account = resolveSimplexAccount({ cfg, accountId: "alpha" });
    expect(account.mode).toBe("external");
    expect(account.wsHost).toBe("base-host");
    expect(account.wsPort).toBe(5225);
    expect(account.wsUrl).toBe("ws://base-host:5225");
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

  it("uses explicit wsUrl for external mode configuration", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            alpha: {
              connection: {
                wsHost: "127.0.0.1",
                wsPort: 5225,
              },
            },
            beta: {
              connection: {
                mode: "external",
                wsUrl: "ws://example.test:9999",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const alpha = resolveSimplexAccount({ cfg, accountId: "alpha" });
    expect(alpha.wsUrl).toBe("ws://127.0.0.1:5225");
    expect(alpha.configured).toBe(true);

    const beta = resolveSimplexAccount({ cfg, accountId: "beta" });
    expect(beta.configured).toBe(true);
  });

  it("treats missing channel config as unconfigured", () => {
    const cfg = { channels: {} } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(false);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(false);
  });

  it("treats explicit ws connection config as configured", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            wsHost: "127.0.0.1",
            wsPort: 5225,
          },
        },
      },
    } as OpenClawConfig;

    expect(hasMeaningfulSimplexConfig({ cfg })).toBe(true);
    expect(resolveSimplexAccount({ cfg, accountId: "default" }).configured).toBe(true);
  });
});
