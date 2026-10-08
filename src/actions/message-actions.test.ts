import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../test-support/simplex-account.js";
import type { SimplexActionParams } from "../types/actions.js";
import type { ResolvedSimplexAccount } from "../types/config.js";
import { executeSimplexMessageAction } from "./message-actions.js";

const client = vi.hoisted(() => ({
  sendMessages: vi.fn(async () => [{ chatItem: { meta: { itemId: 99 } } }]),
  reactToMessage: vi.fn(async () => ({})),
  editMessage: vi.fn(async () => ({})),
  deleteMessages: vi.fn(async () => ({})),
}));

const media = vi.hoisted(() => ({
  buildComposedMessages: vi.fn(
    async (params: { text?: string; mediaUrl?: string }): Promise<unknown[]> =>
      params.text || params.mediaUrl
        ? [{ msgContent: { type: "text", text: params.text ?? "" }, mentions: {} }]
        : []
  ),
}));

vi.mock("../simplex/runtime/transport.js", () => ({
  withSimplexClient: async <T>(params: { run: (client: unknown) => Promise<T> }): Promise<T> =>
    await params.run(client),
}));

vi.mock("../channel/media/simplex-media.js", () => ({
  buildComposedMessages: media.buildComposedMessages,
  resolveSimplexMediaMaxBytes: () => 100_000_000,
}));

const cfg = {
  channels: { "openclaw-simplex": { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
} as OpenClawConfig;

function run(
  action: string,
  toolParams: SimplexActionParams,
  overrides: { cfg?: OpenClawConfig; account?: ResolvedSimplexAccount } = {}
) {
  return executeSimplexMessageAction({
    action: action as Parameters<typeof executeSimplexMessageAction>[0]["action"],
    cfg: overrides.cfg ?? cfg,
    account: overrides.account ?? testSimplexAccount(),
    chatRef: "@alice",
    toolParams,
  });
}

describe("simplex message actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("poll", () => {
    it("renders the poll as text and returns the sent message id", async () => {
      const result = await run("poll", {
        pollQuestion: "Lunch?",
        pollOption: ["Sushi", "Tacos"],
      });

      const text = media.buildComposedMessages.mock.calls[0]?.[0]?.text ?? "";
      expect(text).toContain("Lunch?");
      expect(text).toContain("Sushi");
      expect(text).toContain("Tacos");
      expect(client.sendMessages).toHaveBeenCalledWith(
        expect.objectContaining({ chatRef: "@alice" })
      );
      expect(result?.details).toEqual({
        ok: true,
        poll: true,
        to: "@alice",
        messageId: "99",
      });
    });

    it("requires a question", async () => {
      await expect(run("poll", { pollOption: ["a", "b"] })).rejects.toThrow(
        /pollQuestion required/
      );
    });

    it("requires at least two options", async () => {
      await expect(run("poll", { pollQuestion: "Lunch?", pollOption: ["Sushi"] })).rejects.toThrow(
        /at least two values/
      );
    });
  });

  describe("upload-file", () => {
    it("sends the media with its caption", async () => {
      const result = await run("upload-file", {
        mediaUrl: "/tmp/photo.png",
        caption: "on the roof",
      });

      expect(media.buildComposedMessages).toHaveBeenCalledWith(
        expect.objectContaining({ mediaUrl: "/tmp/photo.png", text: "on the roof" })
      );
      expect(result?.details).toEqual({
        ok: true,
        uploaded: true,
        to: "@alice",
        mediaUrl: "/tmp/photo.png",
        messageId: "99",
      });
    });

    it("passes the voice-note hint through its alias", async () => {
      await run("upload-file", { path: "/tmp/note.m4a", asVoice: true });

      expect(media.buildComposedMessages).toHaveBeenCalledWith(
        expect.objectContaining({ audioAsVoice: true })
      );
    });

    it("requires a media reference", async () => {
      await expect(run("upload-file", { text: "no file" })).rejects.toThrow(
        /mediaUrl, media, filePath, or path required/
      );
    });

    it("reports no message id when nothing composable was produced", async () => {
      media.buildComposedMessages.mockResolvedValueOnce([]);

      const result = await run("upload-file", { mediaUrl: "/tmp/empty.png" });

      expect(client.sendMessages).not.toHaveBeenCalled();
      expect(result?.details).toMatchObject({ messageId: null });
    });
  });

  describe("ttl", () => {
    it("prefers an explicit ttl over the account default", async () => {
      await run(
        "poll",
        { pollQuestion: "Lunch?", pollOption: ["a", "b"], messageTtlSeconds: 60 },
        {
          account: testSimplexAccount({
            config: { connection: { wsHost: "127.0.0.1", wsPort: 5225 }, messageTtlSeconds: 30 },
          }),
        }
      );

      expect(client.sendMessages).toHaveBeenCalledWith(expect.objectContaining({ ttl: 60 }));
    });

    it("falls back to the account ttl", async () => {
      await run(
        "poll",
        { pollQuestion: "Lunch?", pollOption: ["a", "b"] },
        {
          account: testSimplexAccount({
            config: { connection: { wsHost: "127.0.0.1", wsPort: 5225 }, messageTtlSeconds: 30 },
          }),
        }
      );

      expect(client.sendMessages).toHaveBeenCalledWith(expect.objectContaining({ ttl: 30 }));
    });
  });

  describe("react", () => {
    it("adds an emoji reaction", async () => {
      const result = await run("react", { messageId: 5, emoji: "👍" });

      expect(client.reactToMessage).toHaveBeenCalledWith({
        chatRef: "@alice",
        messageId: 5,
        add: true,
        reaction: { type: "emoji", emoji: "👍" },
      });
      expect(result?.details).toEqual({ ok: true, action: "added", emoji: "👍" });
    });

    it("removes a reaction when asked", async () => {
      const result = await run("react", { chatItemId: 5, emoji: "👍", remove: true });

      expect(client.reactToMessage).toHaveBeenCalledWith(
        expect.objectContaining({ add: false, messageId: 5 })
      );
      expect(result?.details).toMatchObject({ action: "removed" });
    });

    it("requires a message id", async () => {
      await expect(run("react", { emoji: "👍" })).rejects.toThrow(/messageId required/);
    });

    it("requires a reaction or an emoji", async () => {
      await expect(run("react", { messageId: 5 })).rejects.toThrow(/reaction or emoji required/);
    });

    it("refuses when the account disables agent reactions", async () => {
      const disabled = {
        channels: {
          "openclaw-simplex": {
            connection: { wsUrl: "ws://127.0.0.1:5225" },
            reactionLevel: "ack",
          },
        },
      } as OpenClawConfig;

      await expect(run("react", { messageId: 5, emoji: "👍" }, { cfg: disabled })).rejects.toThrow(
        /agent reactions disabled/
      );
      expect(client.reactToMessage).not.toHaveBeenCalled();
    });
  });

  describe("edit", () => {
    it("replaces the message body", async () => {
      const result = await run("edit", { messageId: 7, text: "corrected" });

      expect(client.editMessage).toHaveBeenCalledWith({
        chatRef: "@alice",
        messageId: 7,
        updatedMessage: { msgContent: { type: "text", text: "corrected" }, mentions: {} },
      });
      expect(result?.details).toEqual({ ok: true, updated: 7 });
    });

    it("requires a message id", async () => {
      await expect(run("edit", { text: "corrected" })).rejects.toThrow(/messageId required/);
    });

    it("requires replacement text", async () => {
      await expect(run("edit", { messageId: 7 })).rejects.toThrow(/text required/);
    });

    it("refuses text that needs more than one message", async () => {
      media.buildComposedMessages.mockResolvedValueOnce([
        { msgContent: { type: "text", text: "first part" }, mentions: {} },
        { msgContent: { type: "text", text: "second part" }, mentions: {} },
      ]);

      await expect(run("edit", { messageId: 7, text: "long" })).rejects.toThrow(
        /exceeds the SimpleX message size limit/
      );
      expect(client.editMessage).not.toHaveBeenCalled();
    });

    it("refuses when the replacement composes to nothing", async () => {
      media.buildComposedMessages.mockResolvedValueOnce([]);

      await expect(run("edit", { messageId: 7, text: "corrected" })).rejects.toThrow(
        /text required/
      );
    });
  });

  describe("delete", () => {
    it("broadcasts a delete by default", async () => {
      const result = await run("delete", { messageIds: [1, 2] });

      expect(client.deleteMessages).toHaveBeenCalledWith({
        chatRef: "@alice",
        messageIds: [1, 2],
        deleteMode: "broadcast",
      });
      expect(result?.details).toEqual({ ok: true, deleted: [1, 2] });
    });

    it("honours an explicit delete mode on unsend", async () => {
      await run("unsend", { messageId: 3, deleteMode: "internal" });

      expect(client.deleteMessages).toHaveBeenCalledWith(
        expect.objectContaining({ messageIds: [3], deleteMode: "internal" })
      );
    });

    it("requires a message id", async () => {
      await expect(run("delete", {})).rejects.toThrow(/messageId or messageIds required/);
    });
  });

  it("returns null for an action it does not own", async () => {
    await expect(run("renameGroup", { to: "42" })).resolves.toBeNull();
  });
});
