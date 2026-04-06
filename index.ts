import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { simplexPlugin } from "./src/channel/plugin.js";
import { setSimplexRuntime } from "./src/channel/runtime.js";
import { registerSimplexCli, registerSimplexCliMetadata } from "./src/cli/plugin-cli.js";
import { registerSimplexGatewayMethods } from "./src/gateway/methods.js";
import { registerSimplexToolHooks, registerSimplexTools } from "./src/tools/plugin-tools.js";

const pluginEntry: ReturnType<typeof defineChannelPluginEntry> = defineChannelPluginEntry({
  id: "openclaw-simplex",
  name: "SimpleX",
  description: "SimpleX Chat channel plugin via external WebSocket API",
  plugin: simplexPlugin,
  setRuntime: setSimplexRuntime,
  registerCliMetadata: registerSimplexCliMetadata,
  registerFull: (api: OpenClawPluginApi) => {
    registerSimplexCli(api);
    registerSimplexGatewayMethods(api);
    registerSimplexTools(api);
    registerSimplexToolHooks(api);
  },
});

export default pluginEntry;
