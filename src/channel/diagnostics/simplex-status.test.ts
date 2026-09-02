import { describe, expect, it } from "vitest";
import type { SimplexRuntimeCapabilityReport } from "../../simplex/services/runtime-capabilities.js";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import { simplexPlugin } from "../plugin.js";
import { buildSimplexStatus } from "./simplex-status.js";

describe("simplex status adapter", () => {
  it("falls back to resolved account configuration for channel summaries", async () => {
    const summary = await buildSimplexStatus().buildChannelSummary?.({
      account: testSimplexAccount(),
      cfg: { channels: {} },
      defaultAccountId: "default",
      snapshot: {
        accountId: "default",
        running: false,
        connected: false,
      },
    });

    expect(summary).toMatchObject({
      configured: true,
      running: false,
      connected: false,
      healthState: "ready",
      mode: "external",
      wsUrl: "ws://127.0.0.1:5225",
    });
  });

  it("does not expose raw account config through inspectAccount", () => {
    expect(simplexPlugin.config.inspectAccount).toBeUndefined();
  });

  it("reports unsafe remote plaintext WebSocket warnings", async () => {
    const summary = await buildSimplexStatus().buildChannelSummary?.({
      account: testSimplexAccount({
        wsUrl: "ws://example.com:5225",
        wsHost: "example.com",
        config: {
          connection: {
            wsHost: "example.com",
            wsPort: 5225,
          },
        },
      }),
      cfg: { channels: {} },
      defaultAccountId: "default",
      snapshot: {
        accountId: "default",
        running: true,
        connected: false,
      },
    });

    expect(summary?.healthState).toBe("error");
    expect(summary?.transportWarnings).toEqual(
      expect.arrayContaining([expect.stringContaining("plaintext WebSocket")])
    );
  });

  it("includes capability probes in account snapshot application metadata", async () => {
    const capabilities: SimplexRuntimeCapabilityReport = {
      runtimeVersion: null,
      version: { state: "unknown", runtimeVersion: null, value: null },
      activeUser: { state: "supported", runtimeVersion: null, value: { userId: 1 } },
      users: { state: "supported", runtimeVersion: null, count: 1 },
      contacts: { state: "supported", runtimeVersion: null, count: 0 },
      groups: { state: "supported", runtimeVersion: null, count: 0 },
      liveMessages: { state: "unknown", runtimeVersion: null },
      ttl: { state: "unknown", runtimeVersion: null },
      verification: { state: "unknown", runtimeVersion: null },
      moderation: { state: "unknown", runtimeVersion: null },
      files: { state: "unknown", runtimeVersion: null },
      experimentalChannels: { state: "unknown", runtimeVersion: null },
    };

    const snapshot = await buildSimplexStatus().buildAccountSnapshot?.({
      account: testSimplexAccount(),
      cfg: { channels: {} },
      probe: capabilities,
    });

    expect((snapshot?.application as { capabilities?: unknown }).capabilities).toBe(capabilities);
  });

  it("labels group capability counts as advisory directory probes", () => {
    const capabilities: SimplexRuntimeCapabilityReport = {
      runtimeVersion: null,
      version: { state: "unknown", runtimeVersion: null, value: null },
      activeUser: { state: "supported", runtimeVersion: null, value: { userId: 1 } },
      users: { state: "supported", runtimeVersion: null, count: 1 },
      contacts: { state: "supported", runtimeVersion: null, count: 2 },
      groups: { state: "supported", runtimeVersion: null, count: 0 },
      liveMessages: { state: "unknown", runtimeVersion: null },
      ttl: { state: "unknown", runtimeVersion: null },
      verification: { state: "unknown", runtimeVersion: null },
      moderation: { state: "unknown", runtimeVersion: null },
      files: { state: "unknown", runtimeVersion: null },
      experimentalChannels: { state: "unknown", runtimeVersion: null },
    };

    expect(buildSimplexStatus().formatCapabilitiesProbe?.({ probe: capabilities })).toEqual(
      expect.arrayContaining([{ text: "SimpleX groups directory: supported (0, advisory)" }])
    );
  });
});
