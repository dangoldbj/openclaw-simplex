import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import type { SimplexChatItem } from "../../types/events.js";
import type { SimplexInboundAccessResult } from "./simplex-inbound-auth.js";
import { startSimplexMonitor } from "./simplex-monitor.js";

type DispatchCall = {
  pending?: {
    chatRef?: string;
    eventKey?: unknown;
    ctxPayload?: Record<string, unknown>;
    sendPayload?: (payload: { text?: string; replyToId?: string }) => Promise<void>;
  };
  mediaPath?: string;
  mediaType?: string;
  mediaUnavailable?: unknown;
};

const mocks = vi.hoisted(() => ({
  eventHandlers: [] as Array<(event: unknown) => unknown>,
  connectionHandlers: [] as Array<(state: unknown) => unknown>,
  sendMessages: vi.fn(async () => [{ chatItem: { meta: { itemId: 1 } } }]),
  runCommand: vi.fn(async (_command: string): Promise<unknown> => ({ version: "6.5.4" })),
  close: vi.fn(async () => undefined),
  connectSimplexWithRetry: vi.fn(async (): Promise<void> => undefined),
  recordSimplexContactRequest: vi.fn(async () => undefined),
  hasSimplexEventBeenSeen: vi.fn(async () => false),
  markSimplexEventSeen: vi.fn(async () => undefined),
  resolveSimplexInboundAccess: vi.fn(
    async (_params: {
      replyToPairingRequest: (text: string) => Promise<void>;
    }): Promise<SimplexInboundAccessResult> => ({
      allowed: true,
      effectiveWasMentioned: true,
      commandAuthorized: true,
    })
  ),
  dispatchInbound: vi.fn(async (_params: DispatchCall): Promise<void> => undefined),
  queuePendingFile: vi.fn(),
  requestFileDownload: vi.fn(async () => true),
  markFileAccepted: vi.fn(),
  shouldRetryFileAccept: vi.fn(() => true),
  hasPendingFile: vi.fn(() => true),
  finalizePendingFile: vi.fn(async () => undefined),
  isFileAutoAcceptEnabled: vi.fn(() => false),
  buildAndSendSimplexMessages: vi.fn(async () => ({})),
}));

vi.mock("../../simplex/runtime/client.js", () => ({
  SimplexClient: class {
    onEvent(handler: (event: unknown) => unknown) {
      mocks.eventHandlers.push(handler);
      return () => undefined;
    }
    onConnectionState(handler: (state: unknown) => unknown) {
      mocks.connectionHandlers.push(handler);
      return () => undefined;
    }
    sendMessages = mocks.sendMessages;
    runCommand = mocks.runCommand;
    close = mocks.close;
  },
}));

vi.mock("../transport/simplex-connect.js", () => ({
  connectSimplexWithRetry: mocks.connectSimplexWithRetry,
}));

vi.mock("../../simplex/state/contact-requests.js", () => ({
  recordSimplexContactRequest: mocks.recordSimplexContactRequest,
}));

vi.mock("../../simplex/state/event-dedupe.js", () => ({
  hasSimplexEventBeenSeen: mocks.hasSimplexEventBeenSeen,
  markSimplexEventSeen: mocks.markSimplexEventSeen,
}));

vi.mock("./simplex-inbound-auth.js", () => ({
  resolveSimplexInboundAccess: mocks.resolveSimplexInboundAccess,
}));

vi.mock("./simplex-inbound-files.js", () => ({
  dispatchInbound: mocks.dispatchInbound,
  queuePendingFile: mocks.queuePendingFile,
  requestFileDownload: mocks.requestFileDownload,
  markFileAccepted: mocks.markFileAccepted,
  shouldRetryFileAccept: mocks.shouldRetryFileAccept,
  hasPendingFile: mocks.hasPendingFile,
  finalizePendingFile: mocks.finalizePendingFile,
  isFileAutoAcceptEnabled: mocks.isFileAutoAcceptEnabled,
}));

vi.mock("../messaging/simplex-send.js", () => ({
  buildAndSendSimplexMessages: mocks.buildAndSendSimplexMessages,
}));

vi.mock("../media/simplex-media.js", () => ({
  resolveSimplexMediaMaxBytes: () => 1000,
}));

vi.mock("../runtime.js", () => ({
  getSimplexRuntime: () => ({
    channel: {
      routing: {
        resolveAgentRoute: () => ({ agentId: "main", sessionKey: "session-1" }),
      },
      session: {
        resolveStorePath: () => "/tmp/store",
        readSessionUpdatedAt: () => undefined,
      },
      reply: {
        resolveEnvelopeFormatOptions: () => ({}),
        formatAgentEnvelope: (params: { body: string }) => params.body,
        finalizeInboundContext: (ctx: Record<string, unknown>) => ctx,
      },
    },
  }),
}));

const cfg = {
  channels: { "openclaw-simplex": { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
} as OpenClawConfig;

function directItem(overrides: Record<string, unknown> = {}): SimplexChatItem {
  return {
    chatInfo: { type: "direct", contact: { contactId: 5, localDisplayName: "alice" } },
    chatItem: {
      chatDir: { type: "directRcv" },
      content: { type: "rcvMsgContent", msgContent: { type: "text", text: "hello" } },
      meta: { itemId: 11 },
      ...overrides,
    },
  } as unknown as SimplexChatItem;
}

async function startMonitor(account = testSimplexAccount()) {
  const runtime = { log: vi.fn(), error: vi.fn() } as unknown as RuntimeEnv;
  const controller = new AbortController();
  const statusSink = vi.fn();
  await startSimplexMonitor({
    account,
    cfg,
    runtime,
    abortSignal: controller.signal,
    statusSink,
  });
  const emit = mocks.eventHandlers.at(-1);
  const setConnectionState = mocks.connectionHandlers.at(-1);
  if (!emit || !setConnectionState) {
    throw new Error("monitor registered no handlers");
  }
  return { runtime, controller, emit, statusSink, setConnectionState };
}

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe("simplex monitor event handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eventHandlers.length = 0;
    mocks.connectionHandlers.length = 0;
    mocks.hasSimplexEventBeenSeen.mockResolvedValue(false);
    mocks.resolveSimplexInboundAccess.mockResolvedValue({
      allowed: true,
      effectiveWasMentioned: true,
      commandAuthorized: true,
    });
    mocks.shouldRetryFileAccept.mockReturnValue(true);
    mocks.hasPendingFile.mockReturnValue(true);
    mocks.requestFileDownload.mockResolvedValue(true);
    mocks.isFileAutoAcceptEnabled.mockReturnValue(false);
    mocks.runCommand.mockResolvedValue({ version: "6.5.4" });
  });

  describe("connection state", () => {
    it("reports a healthy account once connected", async () => {
      const { statusSink, setConnectionState } = await startMonitor();

      setConnectionState({ connected: true, at: 1234 });

      expect(statusSink).toHaveBeenCalledWith(
        expect.objectContaining({ connected: true, healthState: "healthy", lastConnectedAt: 1234 })
      );
    });

    it("reconnects after an unexpected disconnect", async () => {
      const { setConnectionState } = await startMonitor();
      mocks.connectSimplexWithRetry.mockClear();

      setConnectionState({ connected: false, at: 1, expected: false });
      await flush();

      expect(mocks.connectSimplexWithRetry).toHaveBeenCalledTimes(1);
    });

    it("does not reconnect after an expected disconnect", async () => {
      const { statusSink, setConnectionState } = await startMonitor();
      mocks.connectSimplexWithRetry.mockClear();

      setConnectionState({ connected: false, at: 1, expected: true });
      await flush();

      expect(mocks.connectSimplexWithRetry).not.toHaveBeenCalled();
      expect(statusSink).toHaveBeenCalledWith(
        expect.objectContaining({ healthState: "stopped", running: false })
      );
    });

    it("only runs one reconnect at a time", async () => {
      const { setConnectionState } = await startMonitor();
      mocks.connectSimplexWithRetry.mockClear();
      mocks.connectSimplexWithRetry.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, 5);
          })
      );

      setConnectionState({ connected: false, at: 1, expected: false });
      setConnectionState({ connected: false, at: 2, expected: false });
      await flush();

      expect(mocks.connectSimplexWithRetry).toHaveBeenCalledTimes(1);
      mocks.connectSimplexWithRetry.mockImplementation(async () => undefined);
    });

    it("surfaces a failed reconnect on the account status", async () => {
      const { runtime, statusSink, setConnectionState } = await startMonitor();
      mocks.connectSimplexWithRetry.mockRejectedValueOnce(new Error("still down"));

      setConnectionState({ connected: false, at: 1, expected: false });
      await flush();

      expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("still down"));
      expect(statusSink).toHaveBeenCalledWith(
        expect.objectContaining({ healthState: "error", lastError: "still down" })
      );
    });

    it("carries the disconnect reason onto the status patch", async () => {
      const { statusSink, setConnectionState } = await startMonitor();

      setConnectionState({ connected: false, at: 7, expected: true, error: "socket closed" });

      expect(statusSink).toHaveBeenCalledWith(
        expect.objectContaining({
          lastDisconnect: { at: 7, error: "socket closed" },
          lastError: "socket closed",
        })
      );
    });
  });

  it("closes the client when the monitor is aborted", async () => {
    const { controller } = await startMonitor();

    controller.abort();
    await flush();

    expect(mocks.close).toHaveBeenCalled();
  });

  describe("runtime identity", () => {
    it("confirms the endpoint speaks SimpleX after connecting", async () => {
      const { runtime, statusSink } = await startMonitor();

      expect(mocks.runCommand).toHaveBeenCalledWith("/version");
      expect(runtime.error).not.toHaveBeenCalled();
      expect(statusSink).not.toHaveBeenCalledWith(
        expect.objectContaining({ healthState: "error" })
      );
    });

    it("marks the account unhealthy when the endpoint does not answer as SimpleX", async () => {
      mocks.runCommand.mockRejectedValue(new Error("no response"));
      const { runtime, statusSink } = await startMonitor();

      expect(runtime.error).toHaveBeenCalledWith(
        expect.stringContaining("did not respond as a simplex-chat runtime")
      );
      expect(statusSink).toHaveBeenCalledWith(expect.objectContaining({ healthState: "error" }));
    });

    it("keeps the monitor running so a slow runtime can recover", async () => {
      mocks.runCommand.mockRejectedValue(new Error("no response"));

      const { emit } = await startMonitor();

      // Still listening: an unverified endpoint is reported, not torn down.
      await emit({ type: "newChatItems", chatItems: [directItem()] });
      expect(mocks.dispatchInbound).toHaveBeenCalledTimes(1);
    });

    it("re-checks identity after a reconnect", async () => {
      const { setConnectionState } = await startMonitor();
      mocks.runCommand.mockClear();

      setConnectionState({ connected: false, at: 1, expected: false });
      await flush();

      expect(mocks.runCommand).toHaveBeenCalledWith("/version");
    });

    it("skips the check when the monitor is already aborted", async () => {
      const { controller, setConnectionState } = await startMonitor();
      mocks.runCommand.mockClear();
      controller.abort();

      setConnectionState({ connected: false, at: 1, expected: false });
      await flush();

      expect(mocks.runCommand).not.toHaveBeenCalled();
    });
  });

  it("stores an incoming contact request without dispatching a turn", async () => {
    const { emit } = await startMonitor();

    await emit({ type: "receivedContactRequest", contactRequest: { contactRequestId: 4 } });

    expect(mocks.recordSimplexContactRequest).toHaveBeenCalledWith({
      accountId: "default",
      contactRequest: { contactRequestId: 4 },
    });
    expect(mocks.dispatchInbound).not.toHaveBeenCalled();
  });

  describe("file description ready", () => {
    it("retries the accept and marks the file accepted", async () => {
      const { emit } = await startMonitor();

      await emit({ type: "rcvFileDescrReady", rcvFileTransfer: { fileId: 8 } });

      expect(mocks.requestFileDownload).toHaveBeenCalledWith(
        expect.objectContaining({ fileId: 8 })
      );
      expect(mocks.markFileAccepted).toHaveBeenCalledWith("default", 8);
    });

    it("leaves the file unmarked when the accept fails", async () => {
      mocks.requestFileDownload.mockResolvedValue(false);
      const { emit } = await startMonitor();

      await emit({ type: "rcvFileDescrReady", rcvFileTransfer: { fileId: 8 } });

      expect(mocks.markFileAccepted).not.toHaveBeenCalled();
    });

    it("ignores files it never queued", async () => {
      mocks.shouldRetryFileAccept.mockReturnValue(false);
      const { emit } = await startMonitor();

      await emit({ type: "rcvFileDescrReady", rcvFileTransfer: { fileId: 8 } });

      expect(mocks.requestFileDownload).not.toHaveBeenCalled();
    });

    it("ignores a file id the runtime did not send as a positive integer", async () => {
      const { emit } = await startMonitor();

      await emit({ type: "rcvFileDescrReady", rcvFileTransfer: { fileId: 0 } });
      await emit({ type: "rcvFileDescrReady", rcvFileTransfer: { fileId: "8" } });
      await emit({ type: "rcvFileDescrReady" });

      expect(mocks.requestFileDownload).not.toHaveBeenCalled();
    });
  });

  describe("file complete", () => {
    it("finalizes a pending transfer with its downloaded path", async () => {
      const { emit } = await startMonitor();

      await emit({
        type: "rcvFileComplete",
        chatItem: {
          chatItem: {
            file: { fileId: 3, fileName: "note.pdf", fileSource: { filePath: " /tmp/note.pdf " } },
          },
        },
      });

      expect(mocks.finalizePendingFile).toHaveBeenCalledWith({
        accountId: "default",
        fileId: 3,
        filePath: "/tmp/note.pdf",
        fileName: "note.pdf",
      });
    });

    it("ignores a completion for a file it is not tracking", async () => {
      mocks.hasPendingFile.mockReturnValue(false);
      const { emit } = await startMonitor();

      await emit({
        type: "rcvFileComplete",
        chatItem: { chatItem: { file: { fileId: 3 } } },
      });

      expect(mocks.finalizePendingFile).not.toHaveBeenCalled();
    });
  });

  it("ignores event types it does not handle", async () => {
    const { emit } = await startMonitor();

    await emit({ type: "contactConnected" });

    expect(mocks.dispatchInbound).not.toHaveBeenCalled();
  });

  describe("new chat items", () => {
    it("dispatches an inbound direct message", async () => {
      const { emit } = await startMonitor();

      await emit({ type: "newChatItems", chatItems: [directItem()] });

      expect(mocks.dispatchInbound).toHaveBeenCalledTimes(1);
      const pending = mocks.dispatchInbound.mock.calls[0]?.[0]?.pending;
      expect(pending?.chatRef).toBe("@5");
      expect(pending?.eventKey).toEqual({ accountId: "default", chatId: 5, messageId: 11 });
    });

    it("quotes a reply only where the host's reply-to mode placed a target", async () => {
      const { emit } = await startMonitor();

      await emit({ type: "newChatItems", chatItems: [directItem()] });
      const pending = mocks.dispatchInbound.mock.calls[0]?.[0]?.pending;
      await pending?.sendPayload?.({ text: "first", replyToId: "11" });
      await pending?.sendPayload?.({ text: "second" });

      const replyTargets = mocks.buildAndSendSimplexMessages.mock.calls.map(
        (call: unknown[]) => (call[0] as { replyToId?: unknown }).replyToId
      );
      expect(replyTargets).toEqual(["11", undefined]);
    });

    it.each([
      [undefined, 11],
      ["off", undefined],
    ] as const)("honors reply-to mode %s on the pairing reply", async (replyToMode, expected) => {
      mocks.resolveSimplexInboundAccess.mockImplementation(async (params) => {
        await params.replyToPairingRequest("pairing code");
        return { allowed: false };
      });
      const { emit } = await startMonitor(
        testSimplexAccount({ config: { connection: {}, replyToMode } })
      );

      await emit({ type: "newChatItems", chatItems: [directItem()] });

      expect(mocks.buildAndSendSimplexMessages).toHaveBeenCalledWith(
        expect.objectContaining({ text: "pairing code", replyToId: expected })
      );
    });

    it("does not mark an event seen before it has been dispatched", async () => {
      const { emit } = await startMonitor();

      await emit({ type: "newChatItems", chatItems: [directItem()] });

      // Dedupe is deliberately at-least-once: marking here would drop the
      // message for good if the process stopped mid-turn.
      expect(mocks.markSimplexEventSeen).not.toHaveBeenCalled();
    });

    it("addresses a group message by group id", async () => {
      const { emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [
          {
            chatInfo: { type: "group", groupInfo: { groupId: 42, localDisplayName: "ops" } },
            chatItem: {
              chatDir: { type: "groupRcv", groupMember: { contactId: 9 } },
              content: { type: "rcvMsgContent", msgContent: { type: "text", text: "hi" } },
              meta: { itemId: 12 },
            },
          },
        ],
      });

      expect(mocks.dispatchInbound.mock.calls[0]?.[0]?.pending?.chatRef).toBe("#42");
    });

    it("skips an item it already dispatched", async () => {
      mocks.hasSimplexEventBeenSeen.mockResolvedValue(true);
      const { emit } = await startMonitor();

      await emit({ type: "newChatItems", chatItems: [directItem()] });

      expect(mocks.dispatchInbound).not.toHaveBeenCalled();
    });

    it("marks a rejected sender's message seen instead of dispatching it", async () => {
      mocks.resolveSimplexInboundAccess.mockResolvedValue({ allowed: false });
      const { emit } = await startMonitor();

      await emit({ type: "newChatItems", chatItems: [directItem()] });

      expect(mocks.dispatchInbound).not.toHaveBeenCalled();
      expect(mocks.markSimplexEventSeen).toHaveBeenCalledWith({
        accountId: "default",
        chatId: 5,
        messageId: 11,
      });
    });

    it("skips outbound, contextless, non-message, and empty items", async () => {
      const { emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [
          directItem({ chatDir: { type: "directSnd" } }),
          {
            chatInfo: { type: "direct", contact: {} },
            chatItem: {
              chatDir: { type: "directRcv" },
              content: { type: "rcvMsgContent", msgContent: { type: "text", text: "hi" } },
              meta: { itemId: 13 },
            },
          },
          directItem({ content: { type: "sndMsgContent" } }),
        ],
      });

      expect(mocks.dispatchInbound).not.toHaveBeenCalled();
    });

    it("delivers a blank body as a placeholder rather than dropping it", async () => {
      const { emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [
          directItem({
            content: { type: "rcvMsgContent", msgContent: { type: "text", text: "   " } },
          }),
        ],
      });

      expect(mocks.dispatchInbound.mock.calls[0]?.[0]?.pending?.ctxPayload?.RawBody).toBe(
        "[message]"
      );
    });

    it("names the attachment when a file arrives with no caption", async () => {
      const { emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [
          directItem({
            content: { type: "rcvMsgContent", msgContent: { type: "file", text: "" } },
            file: { fileId: 4, fileSize: 10, fileName: "report.pdf" },
          }),
        ],
      });

      expect(mocks.dispatchInbound.mock.calls[0]?.[0]?.pending?.ctxPayload?.RawBody).toBe(
        "[file: report.pdf]"
      );
    });

    it("ignores a payload whose chat items are not a list", async () => {
      const { emit } = await startMonitor();

      await emit({ type: "newChatItems", chatItems: undefined });

      expect(mocks.dispatchInbound).not.toHaveBeenCalled();
    });

    it("delivers the caption with a notice when the attachment is too large", async () => {
      const { runtime, emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [directItem({ file: { fileId: 4, fileSize: 5000 } })],
      });

      expect(mocks.queuePendingFile).not.toHaveBeenCalled();
      expect(mocks.dispatchInbound).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUnavailable: { reason: "too-large", sizeBytes: 5000, maxBytes: 1000 },
        })
      );
      expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("exceeds limit"));
    });

    it("queues an accepted attachment before requesting the download", async () => {
      mocks.isFileAutoAcceptEnabled.mockReturnValue(true);
      const { emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [directItem({ file: { fileId: 4, fileSize: 10 } })],
      });

      // Queue first: /freceive can fail while the file description is still
      // pending, and the retry path only knows about queued files.
      expect(mocks.queuePendingFile.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.requestFileDownload.mock.invocationCallOrder[0] as number
      );
      expect(mocks.markFileAccepted).toHaveBeenCalledWith("default", 4);
      expect(mocks.dispatchInbound).not.toHaveBeenCalled();
    });

    it("dispatches without media when auto-accept is off", async () => {
      const { emit } = await startMonitor();

      await emit({
        type: "newChatItems",
        chatItems: [directItem({ file: { fileId: 4, fileSize: 10 } })],
      });

      expect(mocks.queuePendingFile).not.toHaveBeenCalled();
      expect(mocks.dispatchInbound).toHaveBeenCalledWith(
        expect.objectContaining({ mediaPath: undefined, mediaType: undefined })
      );
    });

    it("logs a handler failure instead of letting it escape the listener", async () => {
      mocks.resolveSimplexInboundAccess.mockRejectedValue(new Error("auth exploded"));
      const { runtime, emit } = await startMonitor();

      await expect(
        emit({ type: "newChatItems", chatItems: [directItem()] })
      ).resolves.toBeUndefined();

      expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("auth exploded"));
    });
  });
});
