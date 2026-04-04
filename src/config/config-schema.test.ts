import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimplexChannelConfigSchema } from "./config-schema.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../openclaw.plugin.json", import.meta.url), "utf8")
) as {
  channelConfigs?: Record<
    string,
    {
      schema?: unknown;
      label?: string;
      description?: string;
    }
  >;
};

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as {
  openclaw?: {
    channel?: {
      id?: string;
      label?: string;
      blurb?: string;
    };
  };
};

describe("simplex config schema manifest", () => {
  it("keeps openclaw.plugin.json in sync with the runtime channel schema", () => {
    const channelId = packageJson.openclaw?.channel?.id;

    expect(channelId).toBe("openclaw-simplex");
    expect(manifest.channelConfigs?.[channelId ?? ""]?.schema).toEqual(
      SimplexChannelConfigSchema.schema
    );
  });

  it("keeps channel manifest metadata aligned with package metadata", () => {
    const channelId = packageJson.openclaw?.channel?.id ?? "";
    const channelManifest = manifest.channelConfigs?.[channelId];

    expect(channelManifest?.label).toBe(packageJson.openclaw?.channel?.label);
    expect(channelManifest?.description).toBe(packageJson.openclaw?.channel?.blurb);
  });
});
