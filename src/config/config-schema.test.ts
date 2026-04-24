import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimplexChannelConfigSchema } from "./config-schema.js";
import { simplexChannelConfigUiHints } from "./config-ui-hints.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../openclaw.plugin.json", import.meta.url), "utf8")
) as {
  commandAliases?: unknown;
  contracts?: {
    tools?: unknown;
  };
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
    setupEntry?: string;
    channel?: {
      id?: string;
      label?: string;
      blurb?: string;
      detailLabel?: string;
      aliases?: string[];
      systemImage?: string;
      selectionExtras?: string[];
      markdownCapable?: boolean;
      exposure?: {
        configured?: boolean;
        setup?: boolean;
        docs?: boolean;
      };
    };
    install?: {
      minHostVersion?: string;
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
    expect(SimplexChannelConfigSchema.uiHints).toEqual(simplexChannelConfigUiHints);
  });

  it("keeps channel manifest metadata aligned with package metadata", () => {
    const channelId = packageJson.openclaw?.channel?.id ?? "";
    const channelManifest = manifest.channelConfigs?.[channelId];

    expect(channelManifest?.label).toBe(packageJson.openclaw?.channel?.label);
    expect(channelManifest?.description).toBe(packageJson.openclaw?.channel?.blurb);
  });

  it("advertises the 2026.4.23 channel selection metadata", () => {
    expect(packageJson.openclaw?.install?.minHostVersion).toBe(">=2026.4.23");
    expect(packageJson.openclaw?.channel).toMatchObject({
      detailLabel: "SimpleX Chat",
      aliases: ["simplex"],
      systemImage: "link.badge.plus",
      selectionExtras: ["Invite-based reachability", "External WebSocket runtime"],
      markdownCapable: true,
      exposure: {
        configured: true,
        setup: true,
        docs: true,
      },
    });
  });

  it("declares the SimpleX tool contract in the static manifest", () => {
    expect(manifest.contracts?.tools).toEqual([
      "simplex_invite_create",
      "simplex_invite_list",
      "simplex_invite_revoke",
      "simplex_group_add_participant",
      "simplex_group_remove_participant",
      "simplex_group_leave",
    ]);
  });

  it("keeps manifest-owned uiHints for the channel config", () => {
    const channelId = packageJson.openclaw?.channel?.id ?? "";
    const channelManifest = manifest.channelConfigs?.[channelId] as
      | { uiHints?: Record<string, unknown> }
      | undefined;

    expect(channelManifest?.uiHints).toEqual(simplexChannelConfigUiHints);
  });

  it("claims the legacy simplex CLI alias for newer OpenClaw CLI gating", () => {
    expect(manifest.commandAliases).toEqual(expect.arrayContaining(["simplex"]));
  });

  it("does not advertise a setup entry that would suppress plugin CLI loading", () => {
    expect(packageJson.openclaw?.setupEntry).toBeUndefined();
  });
});
