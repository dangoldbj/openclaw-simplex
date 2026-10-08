import { describe, expect, it } from "vitest";
import {
  buildConnectCommand,
  buildConnectPlanCommand,
  buildDeleteChatItemCommand,
  buildGetChatItemsAroundCommand,
  buildSendMessagesCommand,
  buildUpdateChatItemCommand,
  findSimplexChatItemMsgContent,
  parseSimplexNumericId,
} from "./commands.js";

describe("simplex command helpers", () => {
  it("parses numeric ids from SimpleX target forms", () => {
    expect(parseSimplexNumericId(123)).toBe(123);
    expect(parseSimplexNumericId("@123")).toBe(123);
    expect(parseSimplexNumericId("#123")).toBe(123);
    expect(parseSimplexNumericId("contact:123")).toBe(123);
    expect(parseSimplexNumericId("group:123")).toBe(123);
  });

  it("rejects partial numeric ids", () => {
    expect(parseSimplexNumericId("123abc")).toBeNull();
    expect(parseSimplexNumericId("contact:123abc")).toBeNull();
    expect(parseSimplexNumericId("@abc")).toBeNull();
    expect(parseSimplexNumericId(12.5)).toBeNull();
  });

  it("builds live and ttl send commands", () => {
    expect(
      buildSendMessagesCommand({
        chatRef: "@123",
        liveMessage: true,
        ttl: 60,
        composedMessages: [{ msgContent: { type: "text", text: "hello" } }],
      })
    ).toBe('/_send @123 live=on ttl=60 json [{"msgContent":{"type":"text","text":"hello"}}]');
  });

  it("builds live update commands and rejects partial item ids", () => {
    expect(
      buildUpdateChatItemCommand({
        chatRef: "@123",
        chatItemId: "456",
        liveMessage: true,
        updatedMessage: { msgContent: { type: "text", text: "done" } },
      })
    ).toBe('/_update item @123 456 live=on json {"msgContent":{"type":"text","text":"done"}}');

    expect(() =>
      buildDeleteChatItemCommand({
        chatRef: "@123",
        chatItemIds: ["456abc"],
      })
    ).toThrow("invalid SimpleX chat item id");
  });

  it("builds unquoted connect commands for SimpleX links", () => {
    const link = "https://smp18.simplex.im/g#HF_WI7By_xG3JvZHZA-aARcMeiWy1vFvRBmh_8vt4uc";
    expect(buildConnectPlanCommand(link)).toBe(`/connect plan ${link}`);
    expect(buildConnectCommand(link)).toBe(`/connect ${link}`);
  });

  it("rejects whitespace in SimpleX connect links", () => {
    expect(() => buildConnectCommand("https://smp18.simplex.im/g#abc extra")).toThrow(
      "invalid SimpleX connection link"
    );
    expect(() => buildConnectPlanCommand("")).toThrow("invalid SimpleX connection link");
  });

  it("builds a lookup for the items around one chat item", () => {
    expect(buildGetChatItemsAroundCommand({ chatRef: "@3", chatItemId: 52, count: 1 })).toBe(
      "/_get chat @3 around=52 count=1"
    );
    expect(() =>
      buildGetChatItemsAroundCommand({ chatRef: "@3", chatItemId: 52, count: 0 })
    ).toThrow();
  });

  it("finds one item's message content in an apiChat response", () => {
    const image = { type: "image", text: "caption", image: "data:image/jpg;base64,AAAA" };
    const payload = {
      type: "apiChat",
      chat: {
        chatItems: [
          {
            meta: { itemId: 51 },
            content: { type: "sndMsgContent", msgContent: { type: "text", text: "hi" } },
          },
          { meta: { itemId: 52 }, content: { type: "rcvMsgContent", msgContent: image } },
        ],
      },
    };

    expect(findSimplexChatItemMsgContent(payload, 52)).toEqual(image);
    expect(findSimplexChatItemMsgContent(payload, 53)).toBeUndefined();
    expect(findSimplexChatItemMsgContent({ chat: "nope" }, 52)).toBeUndefined();
  });

  it("keeps content types newer than the plugin, so their size still counts", () => {
    const payload = {
      chat: {
        chatItems: [
          {
            meta: { itemId: 7 },
            content: { msgContent: { type: "sticker", text: "", data: "x" } },
          },
        ],
      },
    };

    expect(findSimplexChatItemMsgContent(payload, 7)).toEqual({
      type: "unknown",
      text: "",
      data: "x",
    });
  });
});
