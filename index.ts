import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { simplexPlugin } from "./src/channel/plugin.js";
import { setSimplexRuntime } from "./src/channel/runtime.js";
import { registerSimplexGatewayMethods } from "./src/gateway/methods.js";
import { registerSimplexToolHooks, registerSimplexTools } from "./src/tools/plugin-tools.js";

export default defineChannelPluginEntry({
  id: "simplex",
  name: "SimpleX",
  description: "SimpleX Chat channel plugin via external WebSocket API",
  plugin: simplexPlugin,
  setRuntime: setSimplexRuntime,
  registerFull: (api) => {
    registerSimplexGatewayMethods(api);
    registerSimplexTools(api);
    registerSimplexToolHooks(api);
  },
});
