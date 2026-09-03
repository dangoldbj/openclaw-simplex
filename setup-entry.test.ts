import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";
import setupEntry from "./setup-entry.js";
import { SIMPLEX_CHANNEL_ID, SIMPLEX_PLUGIN_ID } from "./src/constants.js";

type ConfigMigration = (config: OpenClawConfig) =>
  | {
      config: OpenClawConfig;
      changes: string[];
    }
  | null
  | undefined;

type AutoEnableProbe = (ctx: {
  config: OpenClawConfig;
  env: NodeJS.ProcessEnv;
}) => string | string[] | null | undefined;

function registered(): { migration: ConfigMigration; probe: AutoEnableProbe } {
  const migrations: ConfigMigration[] = [];
  const probes: AutoEnableProbe[] = [];
  setupEntry.register({
    registerConfigMigration: (migrate: ConfigMigration) => {
      migrations.push(migrate);
    },
    registerAutoEnableProbe: (probe: AutoEnableProbe) => {
      probes.push(probe);
    },
  } as unknown as OpenClawPluginApi);
  const migration = migrations[0];
  const probe = probes[0];
  if (!migration || !probe) {
    throw new Error("setup entry did not register both surfaces");
  }
  return { migration, probe };
}

function registeredMigration(): ConfigMigration {
  return registered().migration;
}

describe("simplex setup entry", () => {
  it("exposes the channel plugin", () => {
    expect(setupEntry.plugin).toMatchObject({ id: SIMPLEX_CHANNEL_ID });
  });

  it("registers a config migration so the legacy ids self-heal on load", () => {
    const result = registeredMigration()({
      plugins: { entries: { simplex: { enabled: true } } },
      channels: { simplex: { wsUrl: "ws://127.0.0.1:5225" } },
    } as unknown as OpenClawConfig);

    const config = result?.config as unknown as {
      plugins: { entries: Record<string, unknown> };
      channels: Record<string, Record<string, unknown>>;
    };
    expect(config.plugins.entries[SIMPLEX_PLUGIN_ID]).toEqual({ enabled: true });
    expect(config.plugins.entries.simplex).toBeUndefined();
    expect(config.channels[SIMPLEX_CHANNEL_ID]).toMatchObject({
      connection: { wsUrl: "ws://127.0.0.1:5225" },
    });
    expect(result?.changes.length).toBeGreaterThan(0);
  });

  it("stays silent about auto-enable once an account is configured", () => {
    const { probe } = registered();

    expect(
      probe({
        config: {
          channels: { [SIMPLEX_CHANNEL_ID]: { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
        } as unknown as OpenClawConfig,
        env: {},
      })
    ).toBeNull();
  });

  it("returns null for a current config so the host records no change", () => {
    const result = registeredMigration()({
      plugins: { entries: { [SIMPLEX_PLUGIN_ID]: { enabled: true } } },
      channels: { [SIMPLEX_CHANNEL_ID]: { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
    } as unknown as OpenClawConfig);

    expect(result).toBeNull();
  });
});
