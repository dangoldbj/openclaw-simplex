import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { simplexPlugin } from "./src/channel/plugin.js";

export default defineSetupPluginEntry(simplexPlugin);
