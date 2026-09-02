import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSimplexRuntime } from "../runtime.js";
import {
  dispatchInbound,
  finalizePendingFile,
  markFileAccepted,
  type PendingInboundFile,
  queuePendingFile,
  resolveSimplexInboundDir,
  shouldRetryFileAccept,
} from "./simplex-inbound-files.js";

const simplexClientMock = vi.hoisted(() => ({
  sendMessages: vi.fn(async () => [{ chatItem: { meta: { itemId: 123 } } }]),
  editMessage: vi.fn(async () => ({})),
}));

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexClient: vi.fn(async ({ run }) => run(simplexClientMock)),
}));

function installRuntime(
  dispatch: (params: {
    dispatcherOptions: {
      beforeDeliver?: (payload: { text?: string }) => { text?: string } | null;
      deliver: (payload: { text?: string }, info: { kind: "block" | "final" }) => Promise<void>;
    };
    replyOptions?: {
      onPartialReply?: (payload: { text?: string }) => Promise<void> | void;
      disableBlockStreaming?: boolean;
    };
  }) => Promise<void>
): void {
  const runtime = {
    channel: {
      session: {
        recordInboundSession: vi.fn(async () => undefined),
      },
      reply: {
        dispatchReplyWithBufferedBlockDispatcher: vi.fn(dispatch),
      },
    },
  };
  setSimplexRuntime(runtime as object as Partial<PluginRuntime> as PluginRuntime);
}

function fileClient(
  cancelFile: (fileId: number | string) => Promise<unknown>
): PendingInboundFile["client"] {
  const client: Partial<PendingInboundFile["client"]> = { cancelFile };
  return client as PendingInboundFile["client"];
}

function pending(sendPayload = vi.fn(async () => undefined)): PendingInboundFile {
  return {
    fileId: -1,
    chatRef: "@123",
    replyToId: 99,
    ctxPayload: { SessionKey: "simplex:direct:123" },
    storePath: "/tmp/simplex.jsonl",
    sessionKey: "simplex:direct:123",
    account: {
      accountId: "default",
      enabled: true,
      configured: true,
      mode: "external",
      wsUrl: "ws://127.0.0.1:5225",
      wsHost: "127.0.0.1",
      wsPort: 5225,
      config: {
        connection: { wsUrl: "ws://127.0.0.1:5225" },
        streaming: {
          nativeTransport: true,
          throttleMs: 1,
          minChars: 1,
          wordBoundary: false,
        },
      },
    },
    cfg: {},
    runtime: { error: vi.fn(), log: vi.fn(), exit: vi.fn() },
    client: {} as PendingInboundFile["client"],
    sendPayload,
  };
}

describe("resolveSimplexInboundDir", () => {
  it("defaults the inbound files-folder to ~/.simplex/files", () => {
    expect(resolveSimplexInboundDir(pending().account)).toBe(
      path.join(os.homedir(), ".simplex/files")
    );
  });

  it("uses a configured files-folder when set", () => {
    const account = pending().account;
    account.config.connection = {
      ...account.config.connection,
      filesFolder: "/var/lib/simplex-files",
    };
    expect(resolveSimplexInboundDir(account)).toBe("/var/lib/simplex-files");
  });

  it("expands a leading ~ in a configured files-folder", () => {
    const account = pending().account;
    account.config.connection = { ...account.config.connection, filesFolder: "~/custom/files" };
    expect(resolveSimplexInboundDir(account)).toBe(path.join(os.homedir(), "custom/files"));
  });
});

describe("finalizePendingFile media staging", () => {
  let dir: string;
  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("stages the file into media/inbound and exposes canonical media facts", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sx-inbound-"));
    const filePath = path.join(dir, "photo.jpg");
    await writeFile(filePath, "IMG-BYTES");

    const detectMime = vi.fn(async () => "image/jpeg");
    const saveMediaBuffer = vi.fn(async () => ({
      path: "/store/media/inbound/photo---uuid.jpg",
      contentType: "image/jpeg",
    }));
    let capturedCtx: Record<string, unknown> | undefined;
    setSimplexRuntime({
      media: { detectMime },
      channel: {
        media: { saveMediaBuffer },
        session: {
          recordInboundSession: vi.fn(async ({ ctx }: { ctx: Record<string, unknown> }) => {
            capturedCtx = ctx;
          }),
        },
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(async () => undefined),
        },
      },
    } as object as PluginRuntime);

    const current = pending();
    current.fileId = 7;
    queuePendingFile({ pending: current, accountId: current.account.accountId, fileId: 7 });
    await finalizePendingFile({
      accountId: current.account.accountId,
      fileId: 7,
      filePath,
      fileName: "photo.jpg",
    });

    expect(detectMime).toHaveBeenCalledWith({ filePath });
    expect(saveMediaBuffer).toHaveBeenCalledWith(
      expect.anything(),
      "image/jpeg",
      "inbound",
      expect.any(Number),
      "photo.jpg",
      filePath
    );
    expect(capturedCtx?.media).toMatchObject([
      {
        path: "/store/media/inbound/photo---uuid.jpg",
        url: "/store/media/inbound/photo---uuid.jpg",
        contentType: "image/jpeg",
      },
    ]);
  });
});

describe("simplex inbound live replies", () => {
  afterEach(() => {
    vi.useRealTimers();
    simplexClientMock.sendMessages.mockClear();
    simplexClientMock.editMessage.mockClear();
  });

  it("routes partial, block, and final assistant text through one SimpleX live message", async () => {
    const sendPayload = vi.fn(async () => undefined);
    installRuntime(async ({ dispatcherOptions, replyOptions }) => {
      expect(replyOptions?.disableBlockStreaming).toBe(true);
      expect(dispatcherOptions.beforeDeliver?.({ text: "probe" })).toEqual({ text: "probe" });
      await replyOptions?.onPartialReply?.({ text: "hello" });
      await dispatcherOptions.deliver({ text: "hello world" }, { kind: "block" });
      await dispatcherOptions.deliver({ text: "hello world!" }, { kind: "final" });
    });

    await dispatchInbound({ pending: pending(sendPayload) });

    expect(sendPayload).not.toHaveBeenCalled();
    expect(simplexClientMock.sendMessages).toHaveBeenCalledTimes(1);
    expect(simplexClientMock.sendMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        chatRef: "@123",
        liveMessage: true,
      })
    );
    expect(simplexClientMock.editMessage).toHaveBeenCalledTimes(2);
    expect(simplexClientMock.editMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ messageId: "123", liveMessage: true })
    );
    expect(simplexClientMock.editMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ messageId: "123", liveMessage: false })
    );
  });

  it("clears pending file timeout when the file completes", async () => {
    vi.useFakeTimers();
    installRuntime(async () => undefined);
    const cancelFile = vi.fn(async () => undefined);
    const current = pending();
    current.fileId = 42;
    current.client = fileClient(cancelFile);

    queuePendingFile({ pending: current, accountId: current.account.accountId, fileId: 42 });
    await finalizePendingFile({ accountId: current.account.accountId, fileId: 42 });
    await vi.advanceTimersByTimeAsync(90_000);

    expect(cancelFile).not.toHaveBeenCalled();
  });

  it("tracks accept retries for queued pending files", async () => {
    vi.useFakeTimers();
    installRuntime(async () => undefined);
    const current = pending();
    current.fileId = 42;
    current.client = fileClient(vi.fn(async () => undefined));

    // Unknown file: nothing queued, nothing to retry.
    expect(shouldRetryFileAccept(current.account.accountId, 42)).toBe(false);

    // Queued but not yet accepted (initial /freceive failed): retry wanted.
    queuePendingFile({ pending: current, accountId: current.account.accountId, fileId: 42 });
    expect(shouldRetryFileAccept(current.account.accountId, 42)).toBe(true);

    // Accepted: no further retries.
    markFileAccepted(current.account.accountId, 42);
    expect(shouldRetryFileAccept(current.account.accountId, 42)).toBe(false);

    // Finalized: entry removed entirely.
    await finalizePendingFile({ accountId: current.account.accountId, fileId: 42 });
    expect(shouldRetryFileAccept(current.account.accountId, 42)).toBe(false);
  });

  it("replaces an older pending file timeout for the same key", async () => {
    vi.useFakeTimers();
    installRuntime(async () => undefined);
    const firstCancel = vi.fn(async () => undefined);
    const secondCancel = vi.fn(async () => undefined);
    const first = pending();
    first.fileId = 42;
    first.client = fileClient(firstCancel);
    const second = pending();
    second.fileId = 42;
    second.client = fileClient(secondCancel);

    queuePendingFile({ pending: first, accountId: first.account.accountId, fileId: 42 });
    queuePendingFile({ pending: second, accountId: second.account.accountId, fileId: 42 });
    await vi.advanceTimersByTimeAsync(90_000);

    expect(firstCancel).not.toHaveBeenCalled();
    expect(secondCancel).toHaveBeenCalledWith(42);
  });
});

describe("inbound media unavailable notices", () => {
  function installCapturingRuntime(): { recorded: Array<Record<string, unknown>> } {
    const recorded: Array<Record<string, unknown>> = [];
    const runtime = {
      channel: {
        session: {
          recordInboundSession: vi.fn(async (params: { ctx: Record<string, unknown> }) => {
            recorded.push(params.ctx);
          }),
        },
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: vi.fn(async () => undefined),
        },
      },
    };
    setSimplexRuntime(runtime as object as Partial<PluginRuntime> as PluginRuntime);
    return { recorded };
  }

  it("appends a size-limit notice to the caption when the attachment is refused", async () => {
    const { recorded } = installCapturingRuntime();
    const target = pending();
    target.ctxPayload = { ...target.ctxPayload, Body: "look at this", RawBody: "look at this" };

    await dispatchInbound({
      pending: target,
      mediaUnavailable: { reason: "too-large", sizeBytes: 30_000_000, maxBytes: 10_000_000 },
    });

    expect(recorded[0]?.Body).toBe(
      "look at this\n\n[SimpleX attachment not delivered: 30.0 MB exceeds the 10.0 MB limit for this account.]"
    );
    // Command parsing must keep seeing the literal transport text.
    expect(recorded[0]?.RawBody).toBe("look at this");
  });

  it("uses the notice alone when the message carried no caption", async () => {
    const { recorded } = installCapturingRuntime();
    const target = pending();
    target.ctxPayload = { ...target.ctxPayload, Body: "" };

    await dispatchInbound({
      pending: target,
      mediaUnavailable: { reason: "transfer-incomplete" },
    });

    expect(recorded[0]?.Body).toBe(
      "[SimpleX attachment not delivered: the file transfer did not complete.]"
    );
  });

  it("leaves the body untouched when media was delivered", async () => {
    const { recorded } = installCapturingRuntime();
    const target = pending();
    target.ctxPayload = { ...target.ctxPayload, Body: "look at this" };

    await dispatchInbound({
      pending: target,
      mediaPath: "/media/inbound/photo.jpg",
      mediaType: "image/jpeg",
      mediaUnavailable: { reason: "transfer-incomplete" },
    });

    expect(recorded[0]?.Body).toBe("look at this");
    expect(recorded[0]?.media).toMatchObject([{ path: "/media/inbound/photo.jpg" }]);
  });

  // The host applies this fallback inside `finalizeInboundContext`, which has
  // already run by the time SimpleX resolves media, so the plugin applies it.
  it("falls back to application/octet-stream when the runtime reports no type", async () => {
    const { recorded } = installCapturingRuntime();

    await dispatchInbound({
      pending: pending(),
      mediaPath: "/media/inbound/blob.bin",
    });

    expect(recorded[0]?.media).toMatchObject([
      { path: "/media/inbound/blob.bin", contentType: "application/octet-stream" },
    ]);
  });

  it("omits media entirely when nothing was delivered", async () => {
    const { recorded } = installCapturingRuntime();

    await dispatchInbound({
      pending: pending(),
      mediaUnavailable: { reason: "transfer-incomplete" },
    });

    expect(recorded[0]?.media).toBeUndefined();
  });
});
