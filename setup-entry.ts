import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { simplexPlugin } from "./src/channel/plugin.js";
import { migrateSimplexConfig } from "./src/cli/migration.js";

/**
 * Config migrations are collected from the setup entry, not `registerFull`, so
 * they run before plugin code activates.
 */
const setupEntry: ReturnType<typeof defineSetupPluginEntry> & {
  register: (api: OpenClawPluginApi) => void;
} = {
  ...defineSetupPluginEntry(simplexPlugin),
  register: (api: OpenClawPluginApi) => {
    api.registerConfigMigration(migrateSimplexConfig);
  },
};

export default setupEntry;
