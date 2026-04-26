import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import {
  assertSimplexReactActionAllowed,
  resolveSimplexAgentReactionGuidance,
  resolveSimplexReactionLevel,
} from "./discovery.js";

describe("simplex action discovery helpers", () => {
  it("defaults to minimal reaction guidance for configured accounts", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
        },
      },
    } as OpenClawConfig;

    expect(resolveSimplexReactionLevel({ cfg }).level).toBe("minimal");
    expect(resolveSimplexAgentReactionGuidance({ cfg })).toBe("minimal");
  });

  it("blocks reactions when disabled by actions config", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          actions: { reactions: false },
        },
      },
    } as OpenClawConfig;

    expect(() => assertSimplexReactActionAllowed({ cfg })).toThrow(
      /SimpleX reactions are disabled via actions\.reactions/
    );
  });

  it("blocks reactions when reactionLevel is ack", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          reactionLevel: "ack",
        },
      },
    } as OpenClawConfig;

    expect(() => assertSimplexReactActionAllowed({ cfg })).toThrow(
      /SimpleX agent reactions disabled \(reactionLevel="ack"\)/
    );
  });
});
