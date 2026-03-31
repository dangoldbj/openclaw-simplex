import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { simplexPlugin } from "./src/channel/channel.js";

export default defineSetupPluginEntry(simplexPlugin);
