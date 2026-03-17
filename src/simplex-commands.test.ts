import { describe, expect, it, test } from "vitest";
import {
  SIMPLEX_SEND_COMMAND_SAFE_BYTES,
  buildDeleteChatItemCommand,
  buildReceiveFileCommand,
  buildSendMessagesCommand,
  buildUpdateGroupProfileCommand,
  formatChatRef,
  splitSendMessageBatches,
} from "./simplex-commands.js";

describe("simplex commands", () => {
  it("rejects unsafe chat refs in send command", () => {
    expect(() =>
      buildSendMessagesCommand({
        chatRef: "@123 ttl=on",
        composedMessages: [],
      })
    ).toThrow("invalid SimpleX chat ref");
  });

  it("rejects unsafe chat item ids in delete command", () => {
    expect(() =>
      buildDeleteChatItemCommand({
        chatRef: "@123",
        chatItemIds: ["1,2"],
      })
    ).toThrow("invalid SimpleX chat item id");
  });

  it("quotes file paths for receive command", () => {
    expect(
      buildReceiveFileCommand({
        fileId: 7,
        filePath: "/tmp/My File's Name.png",
      })
    ).toBe("/freceive 7 '/tmp/My File\\'s Name.png'");
  });

  it("emits raw JSON payload in send command", () => {
    expect(
      buildSendMessagesCommand({
        chatRef: "@123",
        composedMessages: [
          {
            msgContent: {
              type: "text",
              text: "hello world",
            },
          },
        ],
      })
    ).toBe('/_send @123 json [{"msgContent":{"type":"text","text":"hello world"}}]');
  });

  it("normalizes scoped SimpleX group refs in send command", () => {
    expect(
      buildSendMessagesCommand({
        chatRef: "simplex:group:1",
        composedMessages: [
          {
            msgContent: {
              type: "text",
              text: "hello group",
            },
          },
        ],
      })
    ).toBe('/_send #1 json [{"msgContent":{"type":"text","text":"hello group"}}]');
  });

  test.each(["simplex:4", "simplex:contact:4", "simplex:user:4", "simplex:member:4"])(
    "normalizes scoped SimpleX direct ref %s in delete command",
    (chatRef) => {
      expect(
        buildDeleteChatItemCommand({
          chatRef,
          chatItemIds: [12],
        })
      ).toBe("/_delete item @4 12 broadcast");
    }
  );

  it("splits oversized text messages into safe send batches", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
    const batches = splitSendMessageBatches({
      chatRef: "@123",
      composedMessages: [
        {
          msgContent: {
            type: "text",
            text,
          },
        },
      ],
      maxBytes: 80,
    });

    expect(batches.length).toBeGreaterThan(1);
    expect(
      batches.flatMap((batch) => batch.map((message) => message.msgContent.text)).join("")
    ).toBe(text);
    expect(
      batches.every(
        (batch) =>
          Buffer.byteLength(
            buildSendMessagesCommand({
              chatRef: "@123",
              composedMessages: batch,
            }),
            "utf8"
          ) <= 80
      )
    ).toBe(true);
  });

  it("splits oversized media captions into one media message plus continuation text", () => {
    const caption = "caption ".repeat(20);
    const batches = splitSendMessageBatches({
      chatRef: "#room",
      composedMessages: [
        {
          fileSource: { filePath: "/tmp/file.png" },
          msgContent: {
            type: "image",
            text: caption,
            image: "data",
          },
        },
      ],
      maxBytes: 140,
    });

    expect(batches.length).toBeGreaterThan(1);
    expect(batches[0]?.[0]?.fileSource).toEqual({ filePath: "/tmp/file.png" });
    expect(
      batches
        .slice(1)
        .flat()
        .every((message) => message.msgContent.type === "text")
    ).toBe(true);
    expect(
      batches.flatMap((batch) => batch.map((message) => message.msgContent.text)).join("")
    ).toBe(caption);
  });

  it("uses the documented safe send budget by default", () => {
    expect(SIMPLEX_SEND_COMMAND_SAFE_BYTES).toBe(14_000);
  });

  it("emits raw JSON payload in update group profile command", () => {
    expect(
      buildUpdateGroupProfileCommand({
        groupId: "my-group",
        profile: { displayName: "Team Room" },
      })
    ).toBe('/_group_profile #my-group {"displayName":"Team Room"}');
  });

  it("rejects unsupported local/scoped chat refs", () => {
    expect(() => formatChatRef({ type: "local", id: "abc" })).toThrow(
      "local SimpleX chat refs are not supported"
    );
    expect(() => formatChatRef({ type: "direct", id: "abc", scope: "team" })).toThrow(
      "scoped SimpleX chat refs are not supported"
    );
  });
});
