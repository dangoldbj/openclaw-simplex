import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import { buildSimplexHeartbeat } from "./simplex-heartbeat.js";

describe("simplex heartbeat adapter", () => {
  it("reports not configured accounts as not ready", async () => {
    const heartbeat = buildSimplexHeartbeat(new Map());

    await expect(
      heartbeat.checkReady?.({
        cfg: { channels: {} } as OpenClawConfig,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "simplex-not-configured",
    });
  });

  it("reports configured but stopped accounts as not running", async () => {
    const heartbeat = buildSimplexHeartbeat(new Map());

    await expect(
      heartbeat.checkReady?.({
        cfg: {
          channels: {
            "openclaw-simplex": {
              connection: { wsUrl: "ws://127.0.0.1:5225" },
            },
          },
        } as OpenClawConfig,
      })
    ).resolves.toEqual({
      ok: false,
      reason: "simplex-not-running",
    });
  });

  it("resolves direct and group recipients from config", () => {
    const heartbeat = buildSimplexHeartbeat(new Map());

    expect(
      heartbeat.resolveRecipients?.({
        cfg: {
          channels: {
            "openclaw-simplex": {
              connection: { wsUrl: "ws://127.0.0.1:5225" },
              allowFrom: ["alice", "@bob"],
              groupAllowFrom: ["group:ops"],
            },
          },
        } as OpenClawConfig,
      })
    ).toEqual({
      recipients: ["@alice", "@bob"],
      source: "allowFrom",
    });

    expect(
      heartbeat.resolveRecipients?.({
        cfg: {
          channels: {
            "openclaw-simplex": {
              connection: { wsUrl: "ws://127.0.0.1:5225" },
              allowFrom: ["alice"],
              groupAllowFrom: ["group:ops"],
            },
          },
        } as OpenClawConfig,
        opts: { all: true },
      })
    ).toEqual({
      recipients: ["@alice", "#ops"],
      source: "all",
    });
  });

  it("prefers an explicit recipient override", () => {
    const heartbeat = buildSimplexHeartbeat(new Map());

    expect(
      heartbeat.resolveRecipients?.({
        cfg: { channels: {} } as OpenClawConfig,
        opts: { to: "#ops" },
      })
    ).toEqual({
      recipients: ["#ops"],
      source: "flag",
    });
  });
});
