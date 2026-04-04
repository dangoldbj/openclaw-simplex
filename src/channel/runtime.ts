import { createPluginRuntimeStore, type PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

const runtimeStore = createPluginRuntimeStore<PluginRuntime>("SimpleX runtime not initialized");

export const setSimplexRuntime = runtimeStore.setRuntime;
export const getSimplexRuntime = runtimeStore.getRuntime;
