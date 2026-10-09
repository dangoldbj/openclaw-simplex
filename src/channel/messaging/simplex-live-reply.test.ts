import { afterEach, describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexComposedMessage } from "../../types/simplex.js";
import {
  createSimplexLiveReplyController,
  resolveSimplexLiveStreamingConfig,
} from "./simplex-send.js";

const simplexClientMock = vi.hoisted(() => ({
  sendMessages: vi.fn(async (_params: { composedMessages: SimplexComposedMessage[] }) => [
    { chatItem: { meta: { itemId: 10 } } },
  ]),
  editMessage: vi.fn(async (_params: { updatedMessage: SimplexComposedMessage }) => ({})),
  getChatItemContent: vi.fn(async () => ({ type: "text" as const, text: "question" })),
}));

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexClient: vi.fn(async ({ run }) => run(simplexClientMock)),
}));

function account(streaming: ResolvedSimplexAccount["config"]["streaming"]): ResolvedSimplexAccount {
  return testSimplexAccount({
    config: { connection: { wsUrl: "ws://127.0.0.1:5225" }, streaming },
  });
}

describe("simplex live reply controller", () => {
  afterEach(() => {
    simplexClientMock.sendMessages.mockClear();
    simplexClientMock.editMessage.mockClear();
    simplexClientMock.getChatItemContent.mockClear();
  });

  it("does nothing when native live transport is disabled", async () => {
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({ nativeTransport: false }),
      chatRef: "@123",
    });

    await expect(live.updatePartial({ text: "hello world" })).resolves.toBe(false);
    expect(simplexClientMock.sendMessages).not.toHaveBeenCalled();
    expect(simplexClientMock.editMessage).not.toHaveBeenCalled();
  });

  it("sends one live message, throttles updates, and finalizes in place", async () => {
    let now = 1_000;
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({
        nativeTransport: true,
        throttleMs: 1_000,
        minChars: 5,
        wordBoundary: false,
      }),
      chatRef: "@123",
      replyToId: 99,
      now: () => now,
    });

    await expect(live.updatePartial({ text: "hello" })).resolves.toBe(true);
    expect(simplexClientMock.sendMessages).toHaveBeenCalledWith({
      chatRef: "@123",
      composedMessages: [
        {
          msgContent: { type: "text", text: "hello" },
          quotedItemId: 99,
          mentions: {},
        },
      ],
      liveMessage: true,
      ttl: undefined,
    });

    now = 1_500;
    await expect(live.updatePartial({ text: "hello!" })).resolves.toBe(true);
    expect(simplexClientMock.editMessage).not.toHaveBeenCalled();

    now = 2_100;
    await expect(live.updatePartial({ text: "hello world" })).resolves.toBe(true);
    expect(simplexClientMock.editMessage).toHaveBeenCalledWith({
      chatRef: "@123",
      messageId: "10",
      updatedMessage: {
        msgContent: { type: "text", text: "hello world" },
        quotedItemId: undefined,
        mentions: {},
      },
      liveMessage: true,
    });

    await expect(live.finalize({ text: "hello world!" })).resolves.toBe(true);
    expect(simplexClientMock.editMessage).toHaveBeenLastCalledWith({
      chatRef: "@123",
      messageId: "10",
      updatedMessage: {
        msgContent: { type: "text", text: "hello world!" },
        quotedItemId: undefined,
        mentions: {},
      },
      liveMessage: false,
    });
  });

  it("sends final text that outgrows one message as continuation messages", async () => {
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({ nativeTransport: true, throttleMs: 1, minChars: 1, wordBoundary: false }),
      chatRef: "@123",
      now: () => 10_000,
    });
    const paragraph = `${"x".repeat(999)}\n`;
    const finalText = paragraph.repeat(20).trimEnd();

    await expect(live.updatePartial({ text: "hello" })).resolves.toBe(true);
    await expect(live.finalize({ text: finalText })).resolves.toBe(true);

    const edited = simplexClientMock.editMessage.mock.lastCall?.[0]?.updatedMessage.msgContent.text;
    const continuation = simplexClientMock.sendMessages.mock.lastCall?.[0]?.composedMessages;
    expect(simplexClientMock.sendMessages).toHaveBeenCalledTimes(2);
    expect(continuation).toHaveLength(1);
    expect(`${edited}\n${continuation?.[0]?.msgContent.text}`).toBe(finalText);
  });

  it("falls back when a live update fails", async () => {
    const errors: string[] = [];
    simplexClientMock.editMessage.mockRejectedValueOnce(new Error("update failed"));
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: account({ nativeTransport: true, throttleMs: 1, minChars: 1, wordBoundary: false }),
      chatRef: "@123",
      now: () => 10_000,
      logError: (message) => errors.push(message),
    });

    await expect(live.updatePartial({ text: "hello" })).resolves.toBe(true);
    await expect(live.updatePartial({ text: "hello world" })).resolves.toBe(false);
    await expect(live.finalize({ text: "hello world!" })).resolves.toBe(false);
    expect(errors.join("\n")).toContain("update failed");
  });
});

describe("live draft chunking dual-read", () => {
  function accountWith(config: ResolvedSimplexAccount["config"]): ResolvedSimplexAccount {
    return { ...account({}), config: { ...config } };
  }

  it("keeps the legacy streaming defaults when draftChunk is unset", () => {
    const resolved = resolveSimplexLiveStreamingConfig(
      accountWith({ streaming: { nativeTransport: true } })
    );

    expect(resolved).toMatchObject({
      enabled: true,
      throttleMs: 2000,
      minChars: 24,
      wordBoundary: true,
    });
    expect(resolved.maxChars).toBeUndefined();
    expect(resolved.breakPreference).toBeUndefined();
  });

  it("keeps explicit legacy streaming values when draftChunk is unset", () => {
    expect(
      resolveSimplexLiveStreamingConfig(
        accountWith({
          streaming: { nativeTransport: true, minChars: 5, throttleMs: 50, wordBoundary: false },
        })
      )
    ).toMatchObject({ minChars: 5, throttleMs: 50, wordBoundary: false });
  });

  it("switches to the shared resolver once draftChunk is configured", () => {
    const resolved = resolveSimplexLiveStreamingConfig(
      accountWith({
        streaming: { nativeTransport: true, minChars: 5, throttleMs: 50 },
        draftChunk: { minChars: 120, maxChars: 600, breakPreference: "sentence" },
      })
    );

    expect(resolved).toMatchObject({
      enabled: true,
      // throttleMs stays plugin-owned: the host chunking model has no equivalent.
      throttleMs: 50,
      minChars: 120,
      maxChars: 600,
      breakPreference: "sentence",
    });
  });
});

describe("live draft rendering with draftChunk", () => {
  afterEach(() => {
    simplexClientMock.sendMessages.mockClear();
    simplexClientMock.editMessage.mockClear();
  });

  it("trims a partial draft back to the last sentence boundary", async () => {
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: {
        ...account({ nativeTransport: true, throttleMs: 0 }),
        config: {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          streaming: { nativeTransport: true, throttleMs: 0 },
          draftChunk: { minChars: 1, breakPreference: "sentence" },
        },
      },
      chatRef: "@123",
    });

    await live.updatePartial({ text: "First done. Second half unfinis" });

    expect(simplexClientMock.sendMessages).toHaveBeenCalledWith({
      chatRef: "@123",
      composedMessages: [
        {
          msgContent: { type: "text", text: "First done." },
          quotedItemId: undefined,
          mentions: {},
        },
      ],
      liveMessage: true,
      ttl: undefined,
    });
  });

  it("caps the live draft at maxChars but never truncates the final reply", async () => {
    const live = createSimplexLiveReplyController({
      cfg: {},
      account: {
        ...account({ nativeTransport: true, throttleMs: 0 }),
        config: {
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          streaming: { nativeTransport: true, throttleMs: 0 },
          draftChunk: { minChars: 1, maxChars: 10, breakPreference: "newline" },
        },
      },
      chatRef: "@123",
    });

    await live.updatePartial({ text: "abcdefghijklmnopqrstuvwxyz" });
    expect(simplexClientMock.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        composedMessages: [
          expect.objectContaining({ msgContent: { type: "text", text: "abcdefghij" } }),
        ],
      })
    );

    await live.finalize({ text: "abcdefghijklmnopqrstuvwxyz" });
    expect(simplexClientMock.editMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        updatedMessage: expect.objectContaining({
          msgContent: { type: "text", text: "abcdefghijklmnopqrstuvwxyz" },
        }),
        liveMessage: false,
      })
    );
  });
});
