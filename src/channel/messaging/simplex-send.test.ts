import { describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import type { SimplexComposedMessage, SimplexMsgContent } from "../../types/simplex.js";
import { buildAndSendSimplexMessages } from "./simplex-send.js";

const account = testSimplexAccount({ config: { connection: { wsUrl: "ws://127.0.0.1:5225" } } });

// The photo from #33: a 13,874-byte thumbnail and a 241-byte caption.
const photo: SimplexMsgContent = {
  type: "image",
  text: "c".repeat(241),
  image: `data:image/jpg;base64,${"A".repeat(13_874 - 22)}`,
};

function sendSpy() {
  return vi.fn(async (_params: { composedMessages: SimplexComposedMessage[] }) => [
    { chatItem: { meta: { itemId: 60 } } },
  ]);
}

describe("buildAndSendSimplexMessages", () => {
  it("quotes only the first message of a reply that outgrows one", async () => {
    const send = sendSpy();
    const text = "The agent explains the photo in some detail. ".repeat(53);

    await buildAndSendSimplexMessages({
      cfg: {},
      account,
      chatRef: "@3",
      text,
      replyToId: 52,
      send,
      lookupQuote: async () => photo,
    });

    const messages = send.mock.lastCall?.[0]?.composedMessages ?? [];
    expect(messages.length).toBeGreaterThan(1);
    expect(messages[0]?.quotedItemId).toBe(52);
    expect(messages.slice(1).every((message) => message.quotedItemId === undefined)).toBe(true);
  });

  it("does not look anything up for a reply without a quote", async () => {
    const lookupQuote = vi.fn(async () => photo);

    await buildAndSendSimplexMessages({
      cfg: {},
      account,
      chatRef: "@3",
      text: "hello",
      send: sendSpy(),
      lookupQuote,
    });

    expect(lookupQuote).not.toHaveBeenCalled();
  });

  it.each([
    ["is missing", async () => undefined, "item 52 not found"],
    [
      "fails",
      async () => {
        throw new Error("runtime offline");
      },
      "runtime offline",
    ],
  ])("sends unquoted when the quoted item %s", async (_case, lookupQuote, logged) => {
    const send = sendSpy();
    const errors: string[] = [];

    await buildAndSendSimplexMessages({
      cfg: {},
      account,
      chatRef: "@3",
      text: "hello",
      replyToId: 52,
      send,
      lookupQuote,
      logError: (message) => errors.push(message),
    });

    expect(send.mock.lastCall?.[0]?.composedMessages).toEqual([
      { msgContent: { type: "text", text: "hello" }, mentions: {} },
    ]);
    expect(errors.join("\n")).toContain(logged);
  });
});
