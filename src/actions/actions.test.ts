import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import { simplexMessageActions } from "./actions.js";
import { resolveSimplexAgentReactionGuidance } from "./discovery.js";

describe("simplex message tool discovery", () => {
  it("returns action schema for configured accounts", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            wsUrl: "ws://127.0.0.1:5225",
          },
        },
      },
    } as OpenClawConfig;

    const result = simplexMessageActions.describeMessageTool({
      cfg,
      currentChannelId: "openclaw-simplex",
    });

    expect(result).toBeTruthy();
    expect(result?.actions).toEqual(
      expect.arrayContaining([
        "send",
        "react",
        "poll",
        "upload-file",
        "edit",
        "delete",
        "unsend",
        "renameGroup",
        "addParticipant",
        "removeParticipant",
        "leaveGroup",
      ])
    );
    expect(result?.capabilities).toEqual(["presentation"]);
    expect(result?.mediaSourceParams).toEqual({
      "upload-file": ["mediaUrl", "media", "path", "filePath"],
    });
    expect(result?.schema).toMatchObject({
      properties: expect.objectContaining({
        chatRef: expect.any(Object),
        groupId: expect.any(Object),
        messageId: expect.any(Object),
        messageIds: expect.any(Object),
        mediaUrl: expect.any(Object),
        filePath: expect.any(Object),
        caption: expect.any(Object),
        emoji: expect.any(Object),
        displayName: expect.any(Object),
        participant: expect.any(Object),
      }),
    });
  });

  it("returns null when no configured accounts are available", () => {
    const cfg = { channels: {} } as OpenClawConfig;

    expect(
      simplexMessageActions.describeMessageTool({
        cfg,
        currentChannelId: "openclaw-simplex",
      })
    ).toBeNull();
  });

  it("omits react when reactionLevel disables agent reactions", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          reactionLevel: "ack",
        },
      },
    } as OpenClawConfig;

    expect(simplexMessageActions.describeMessageTool({ cfg })?.actions).toEqual(
      expect.arrayContaining(["send", "poll", "upload-file"])
    );
    expect(simplexMessageActions.describeMessageTool({ cfg })?.actions).not.toContain("react");
    expect(resolveSimplexAgentReactionGuidance({ cfg })).toBeUndefined();
  });

  it("omits poll when disabled via actions config", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          actions: { polls: false },
        },
      },
    } as OpenClawConfig;

    const actions = simplexMessageActions.describeMessageTool({ cfg })?.actions ?? [];
    expect(actions).toContain("react");
    expect(actions).not.toContain("poll");
  });

  it("uses account-scoped reactionLevel for discovery and guidance", () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          reactionLevel: "ack",
          accounts: {
            work: {
              connection: { wsUrl: "ws://127.0.0.1:6225" },
              reactionLevel: "minimal",
            },
          },
        },
      },
    } as OpenClawConfig;

    expect(simplexMessageActions.describeMessageTool({ cfg, accountId: "work" })?.actions).toEqual(
      expect.arrayContaining(["react", "poll"])
    );
    expect(resolveSimplexAgentReactionGuidance({ cfg, accountId: "work" })).toBe("minimal");
  });
});
