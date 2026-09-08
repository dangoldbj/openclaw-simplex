import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimplexChannelConfigSchema } from "./config-schema.js";
import { simplexChannelConfigUiHints } from "./config-ui-hints.js";

const manifest = JSON.parse(
  readFileSync(new URL("../../openclaw.plugin.json", import.meta.url), "utf8")
) as {
  activation?: {
    onStartup?: unknown;
    onChannels?: unknown;
    onCapabilities?: unknown;
  };
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
    compat?: {
      pluginApi?: string;
      minGatewayVersion?: string;
    };
    build?: {
      openclawVersion?: string;
      pluginSdkVersion?: string;
    };
    channel?: {
      id?: string;
      label?: string;
      blurb?: string;
      detailLabel?: string;
      aliases?: string[];
      systemImage?: string;
      selectionExtras?: string[];
      markdownCapable?: boolean;
      forceAccountBinding?: boolean;
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

  it("advertises the 2026.9.2 compatibility and channel selection metadata", () => {
    // The `-0` prerelease floor is deliberate: npm's `latest` tag has shipped as a
    // prerelease-shaped version (e.g. 2026.7.1-2), which sorts below the plain
    // release and would fail a bare `>=` gate.
    expect(packageJson.openclaw?.install?.minHostVersion).toBe(">=2026.9.2-0");
    expect(packageJson.openclaw?.compat).toEqual({
      pluginApi: ">=2026.9.2-0",
      minGatewayVersion: "2026.9.2-0",
    });
    expect(packageJson.openclaw?.build).toEqual({
      openclawVersion: "2026.9.2",
      pluginSdkVersion: "2026.9.2",
    });
    expect(packageJson.openclaw?.channel).toMatchObject({
      detailLabel: "SimpleX Chat",
      aliases: ["simplex"],
      systemImage: "link.badge.plus",
      selectionExtras: ["Invite-based reachability", "External WebSocket runtime"],
      markdownCapable: true,
      forceAccountBinding: true,
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

  it("opts out of deprecated implicit startup loading", () => {
    expect(manifest.activation).toMatchObject({
      onStartup: false,
      onChannels: ["openclaw-simplex"],
      onCapabilities: ["channel", "tool"],
    });
  });

  it("does not advertise a setup entry that would suppress plugin CLI loading", () => {
    expect(packageJson.openclaw?.setupEntry).toBeUndefined();
  });
});
