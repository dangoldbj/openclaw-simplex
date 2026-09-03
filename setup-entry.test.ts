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

function registeredMigration(): ConfigMigration {
  const migrations: ConfigMigration[] = [];
  setupEntry.register({
    registerConfigMigration: (migrate: ConfigMigration) => {
      migrations.push(migrate);
    },
  } as unknown as OpenClawPluginApi);
  const migration = migrations[0];
  if (!migration) {
    throw new Error("setup entry registered no config migration");
  }
  return migration;
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

  it("returns null for a current config so the host records no change", () => {
    const result = registeredMigration()({
      plugins: { entries: { [SIMPLEX_PLUGIN_ID]: { enabled: true } } },
      channels: { [SIMPLEX_CHANNEL_ID]: { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
    } as unknown as OpenClawConfig);

    expect(result).toBeNull();
  });
});
