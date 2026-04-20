import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimplexChannelConfigSchema } from "./config-schema.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../openclaw.plugin.json", import.meta.url), "utf8")
) as {
  commandAliases?: unknown;
  channelConfigs?: Record<
    string,
    {
      schema?: unknown;
      label?: string;
      description?: string;
      uiHints?: unknown;
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

  it("keeps manifest-owned uiHints for the channel config", () => {
    const channelId = packageJson.openclaw?.channel?.id ?? "";
    const channelManifest = manifest.channelConfigs?.[channelId] as
      | { uiHints?: Record<string, unknown> }
      | undefined;

    expect(channelManifest?.uiHints).toMatchObject({
      "": {
        label: "SimpleX",
      },
      "connection.wsUrl": {
        label: "WebSocket URL",
      },
      dmPolicy: {
        label: "DM Policy",
      },
    });
  });

  it("claims the legacy simplex CLI alias for newer OpenClaw CLI gating", () => {
    expect(manifest.commandAliases).toEqual(expect.arrayContaining(["simplex"]));
  });
});
