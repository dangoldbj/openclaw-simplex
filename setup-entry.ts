import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { simplexPlugin } from "./src/channel/plugin.js";
import { probeSimplexAutoEnable } from "./src/channel/setup-probe.js";
import { migrateSimplexConfig } from "./src/cli/migration.js";

/**
 * Config migrations and auto-enable probes are collected from the setup entry,
 * not `registerFull`, so they run before plugin code activates.
 */
const setupEntry: ReturnType<typeof defineSetupPluginEntry> & {
  register: (api: OpenClawPluginApi) => void;
} = {
  ...defineSetupPluginEntry(simplexPlugin),
  register: (api: OpenClawPluginApi) => {
    api.registerConfigMigration(migrateSimplexConfig);
    api.registerAutoEnableProbe(probeSimplexAutoEnable);
  },
};

export default setupEntry;
