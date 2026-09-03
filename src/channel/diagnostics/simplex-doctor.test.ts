import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { afterEach, describe, expect, it } from "vitest";
import { simplexDoctor } from "./simplex-doctor.js";

// Config-only assertions opt out of the live probe so they never depend on a
// reachable simplex-chat runtime.
function previewWarnings(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = { OPENCLAW_SIMPLEX_DOCTOR_SKIP_RUNTIME_PROBE: "1" }
): Promise<string[]> {
  return Promise.resolve(
    simplexDoctor.collectPreviewWarnings?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
      env,
    }) ?? []
  );
}

describe("simplex doctor", () => {
  it("describes SimpleX policy model for OpenClaw doctor", () => {
    expect(simplexDoctor).toMatchObject({
      groupModel: "sender",
      dmAllowFromMode: "topOrNested",
      warnOnEmptyGroupSenderAllowlist: true,
    });
  });

  it("warns about legacy config and empty allowlists", async () => {
    const cfg = {
      channels: {
        simplex: {},
        "openclaw-simplex": {
          dmPolicy: "allowlist",
          allowFrom: [],
          groupPolicy: "allowlist",
          groupAllowFrom: [],
          accounts: {
            alt: {
              dmPolicy: "allowlist",
              allowFrom: [],
              groupPolicy: "allowlist",
              groupAllowFrom: [],
            },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await (simplexDoctor.collectPreviewWarnings?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
    }) ?? []);

    expect(warnings.join("\n")).toContain("Legacy channels.simplex config is present");
    expect(warnings.join("\n")).toContain('dmPolicy="allowlist" is configured with an empty');
    expect(warnings.join("\n")).toContain('groupPolicy="allowlist" is configured with an empty');
  });
});

describe("simplex doctor legacy config repair", () => {
  it("declares a rule for the renamed channel and every pre-1.0 runtime field", () => {
    const paths = (simplexDoctor.legacyConfigRules ?? []).map((rule) => rule.path.join("."));

    expect(paths).toContain("channels.simplex");
    expect(paths).toContain("channels.openclaw-simplex.managed");
    expect(paths).toContain("channels.openclaw-simplex.wsUrl");
    expect(paths).toContain("channels.openclaw-simplex.cliPath");
  });

  it("never claims a current root config key is legacy", () => {
    const legacyKeys = new Set(
      (simplexDoctor.legacyConfigRules ?? [])
        .filter((rule) => rule.path[1] === "openclaw-simplex" && rule.path.length === 3)
        .map((rule) => rule.path[2])
    );

    for (const current of ["connection", "accounts", "allowFrom", "name", "streaming", "enabled"]) {
      expect(legacyKeys).not.toContain(current);
    }
  });

  it("moves a legacy channel and its runtime fields onto the current shape", async () => {
    const mutation = await simplexDoctor.repairConfig?.({
      cfg: {
        channels: { simplex: { wsUrl: "ws://127.0.0.1:5225", managed: true, dmPolicy: "pairing" } },
      } as unknown as OpenClawConfig,
      doctorFixCommand: "openclaw doctor --fix",
    });

    const channels = mutation?.config.channels as Record<string, Record<string, unknown>>;
    expect(channels.simplex).toBeUndefined();
    expect(channels["openclaw-simplex"]).toMatchObject({
      dmPolicy: "pairing",
      connection: { wsUrl: "ws://127.0.0.1:5225", mode: "external" },
    });
    expect(channels["openclaw-simplex"]?.managed).toBeUndefined();
    expect(mutation?.changes.join("\n")).toContain("channels.simplex -> channels.openclaw-simplex");
  });

  it("tells the operator that credential files still need the CLI", async () => {
    const mutation = await simplexDoctor.repairConfig?.({
      cfg: { channels: { simplex: { wsUrl: "ws://127.0.0.1:5225" } } } as unknown as OpenClawConfig,
      doctorFixCommand: "openclaw doctor --fix",
    });

    expect(mutation?.warnings?.join("\n")).toContain("openclaw simplex migrate");
  });

  it("reports no changes for a config that is already current", async () => {
    const cfg = {
      channels: { "openclaw-simplex": { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
    } as unknown as OpenClawConfig;

    const mutation = await simplexDoctor.repairConfig?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
    });

    expect(mutation?.changes).toEqual([]);
    expect(mutation?.config).toBe(cfg);
  });
});

describe("simplex doctor files-folder check", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("warns when connection.filesFolder does not exist", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { filesFolder: "/no/such/simplex/files" },
        },
      },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg);
    expect(warnings.join("\n")).toContain("/no/such/simplex/files");
    expect(warnings.join("\n")).toContain("does not exist");
  });

  it("checks a per-account filesFolder override, not just the channel level", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sx-doctor-"));
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { filesFolder: dir },
          accounts: {
            alt: { connection: { filesFolder: "/no/such/account/files" } },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg);
    // channel folder is fine; the account override is flagged
    expect(warnings.join("\n")).toContain("/no/such/account/files");
    expect(warnings.join("\n")).toContain('for account "alt"');
    expect(warnings.join("\n")).not.toContain(dir);
  });

  it("does not warn when the files-folder exists and is writable", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sx-doctor-"));
    const cfg = {
      channels: {
        "openclaw-simplex": { connection: { filesFolder: dir } },
      },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg);
    expect(warnings.join("\n")).not.toContain("Received files");
  });
});

describe("simplex doctor runtime probe", () => {
  // Port 1 is reserved and never listening, so the probe fails fast rather than
  // waiting out its timeout.
  const unreachable = { connection: { wsUrl: "ws://127.0.0.1:1" } };

  it("reports an unreachable runtime instead of throwing", async () => {
    const cfg = {
      channels: { "openclaw-simplex": unreachable },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg, {});
    expect(warnings.join("\n")).toContain("ws://127.0.0.1:1");
    expect(warnings.join("\n")).toContain("simplex-chat runtime");
  });

  it("skips the probe when the opt-out env var is set", async () => {
    const cfg = {
      channels: { "openclaw-simplex": unreachable },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg, {
      OPENCLAW_SIMPLEX_DOCTOR_SKIP_RUNTIME_PROBE: "1",
    });
    expect(warnings.join("\n")).not.toContain("ws://127.0.0.1:1");
  });

  it("does not probe when no account is configured", async () => {
    const cfg = {
      channels: { "openclaw-simplex": { dmPolicy: "pairing" } },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg, {});
    expect(warnings.join("\n")).not.toContain("simplex-chat runtime");
  });

  it("scopes runtime warnings by account when several are configured", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          accounts: {
            primary: { connection: { wsUrl: "ws://127.0.0.1:1" } },
            alt: { connection: { wsUrl: "ws://127.0.0.1:2" } },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await previewWarnings(cfg, {});
    expect(warnings.join("\n")).toContain('for account "primary"');
    expect(warnings.join("\n")).toContain('for account "alt"');
  });
});
