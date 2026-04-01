import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { simplexPlugin } from "./src/channel/plugin.js";
import { setSimplexRuntime } from "./src/channel/runtime.js";
import { registerSimplexCli } from "./src/cli/plugin-cli.js";
import { registerSimplexGatewayMethods } from "./src/gateway/methods.js";
import { registerSimplexToolHooks, registerSimplexTools } from "./src/tools/plugin-tools.js";

export default definePluginEntry({
  id: "openclaw-simplex",
  name: "SimpleX",
  description: "SimpleX Chat channel plugin via external WebSocket API",
  register: (api: OpenClawPluginApi) => {
    setSimplexRuntime(api.runtime);
    api.registerChannel(simplexPlugin);
    registerSimplexCli(api);
    if (api.registrationMode !== "full") {
      return;
    }
    registerSimplexGatewayMethods(api);
    registerSimplexTools(api);
    registerSimplexToolHooks(api);
  },
});
