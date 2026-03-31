import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { describe, expect, it } from "vitest";
import { simplexMessageActions } from "./actions.js";

describe("simplex message tool discovery", () => {
  it("returns action schema for configured accounts", () => {
    const cfg = {
      channels: {
        simplex: {
          connection: {
            mode: "managed",
            cliPath: "simplex-chat",
          },
        },
      },
    } as OpenClawConfig;

    const result = simplexMessageActions.describeMessageTool({
      cfg,
      currentChannelId: "simplex",
    });

    expect(result).toBeTruthy();
    expect(result?.actions).toEqual(
      expect.arrayContaining([
        "send",
        "upload-file",
        "react",
        "edit",
        "delete",
        "unsend",
        "renameGroup",
        "addParticipant",
        "removeParticipant",
        "leaveGroup",
      ])
    );
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
        currentChannelId: "simplex",
      })
    ).toBeNull();
  });
});
