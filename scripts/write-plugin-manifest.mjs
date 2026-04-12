import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(rootDir, "openclaw.plugin.json");
const packageJsonPath = path.join(rootDir, "package.json");
const distEntryPath = path.join(rootDir, "dist", "index.js");

const [{ default: pluginEntry }, manifestRaw, packageJsonRaw] = await Promise.all([
  import(pathToFileURL(distEntryPath).href),
  readFile(manifestPath, "utf8"),
  readFile(packageJsonPath, "utf8"),
]);

const manifest = JSON.parse(manifestRaw);
const packageJson = JSON.parse(packageJsonRaw);
const channelPlugin = pluginEntry?.channelPlugin;
const channelId = channelPlugin?.id;
const channelSchema = channelPlugin?.configSchema;
const existingChannelConfig = manifest.channelConfigs?.[channelId] ?? {};

if (!channelId || !channelSchema?.schema || typeof channelSchema.schema !== "object") {
  throw new Error("Built plugin entry does not expose a channel config schema");
}

const packageChannelMeta =
  packageJson?.openclaw?.channel?.id === channelId ? packageJson.openclaw.channel : {};

manifest.channelConfigs = {
  ...(manifest.channelConfigs ?? {}),
  [channelId]: {
    schema: channelSchema.schema,
    ...((existingChannelConfig.uiHints ?? channelSchema.uiHints)
      ? {
          uiHints: {
            ...(channelSchema.uiHints ?? {}),
            ...(existingChannelConfig.uiHints ?? {}),
          },
        }
      : {}),
    ...(packageChannelMeta?.label ? { label: packageChannelMeta.label } : {}),
    ...(packageChannelMeta?.blurb ? { description: packageChannelMeta.blurb } : {}),
    ...(packageChannelMeta?.preferOver ? { preferOver: packageChannelMeta.preferOver } : {}),
  },
};

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
