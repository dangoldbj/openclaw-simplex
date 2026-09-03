import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { registerSimplexPairingHooks } from "./src/channel/contacts/simplex-pairing.js";
import { buildSimplexRuntimeLifecycle } from "./src/channel/lifecycle/simplex-lifecycle.js";
import { simplexPlugin } from "./src/channel/plugin.js";
import { setSimplexRuntime } from "./src/channel/runtime.js";
import { registerSimplexControlUi } from "./src/channel/ui/simplex-panel.js";
import { registerSimplexCliMetadata } from "./src/cli/plugin-cli.js";
import { SIMPLEX_PLUGIN_ID } from "./src/constants.js";
import { registerSimplexGatewayMethods } from "./src/gateway/methods.js";
import { registerSimplexToolHooks, registerSimplexTools } from "./src/tools/plugin-tools.js";

const pluginEntry: ReturnType<typeof defineChannelPluginEntry> = defineChannelPluginEntry({
  id: SIMPLEX_PLUGIN_ID,
  name: "SimpleX",
  description: "SimpleX Chat channel plugin via an external WebSocket runtime",
  plugin: simplexPlugin,
  setRuntime: setSimplexRuntime,
  registerCliMetadata: registerSimplexCliMetadata,
  registerFull: (api: OpenClawPluginApi) => {
    registerSimplexGatewayMethods(api);
    registerSimplexTools(api);
    registerSimplexToolHooks(api);
    registerSimplexControlUi(api);
    registerSimplexPairingHooks(api);
    api.registerRuntimeLifecycle(buildSimplexRuntimeLifecycle(api));
  },
});

export default pluginEntry;
