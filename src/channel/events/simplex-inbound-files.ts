import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { SimplexNodeClient } from "../../simplex/simplex-node-client.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { getSimplexRuntime } from "../runtime.js";

const PENDING_FILE_TIMEOUT_MS = 90_000;

type SimplexReplyPayload = {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
};

export type PendingInboundFile = {
  fileId: number;
  ctxPayload: Record<string, unknown>;
  storePath: string;
  sessionKey: string;
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  client: SimplexNodeClient;
  sendPayload: (payload: SimplexReplyPayload) => Promise<void>;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

const pendingFiles = new Map<string, PendingInboundFile>();

function pendingKey(accountId: string, fileId: number): string {
  return `${accountId}:${fileId}`;
}

export async function requestFileDownload(params: {
  fileId: number;
  account: ResolvedSimplexAccount;
  client: SimplexNodeClient;
  runtime: RuntimeEnv;
}): Promise<boolean> {
  const { fileId, account, client, runtime } = params;
  const autoAccept = account.config.connection?.autoAcceptFiles !== false;
  if (!autoAccept) {
    return false;
  }
  try {
    await client.withApi((api) => api.apiReceiveFile(fileId));
  } catch (err) {
    runtime.error?.(`[${account.accountId}] SimpleX receive file failed: ${String(err)}`);
    return false;
  }
  return true;
}

export function queuePendingFile(params: {
  pending: PendingInboundFile;
  accountId: string;
  fileId: number;
}): void {
  const { pending, accountId, fileId } = params;
  pendingFiles.set(pendingKey(accountId, fileId), pending);
  setTimeout(() => {
    const key = pendingKey(accountId, fileId);
    const current = pendingFiles.get(key);
    if (!current) {
      return;
    }
    pendingFiles.delete(key);
    void current.client
      .withApi((api) => api.apiCancelFile(fileId))
      .catch((err) => {
        current.runtime.error?.(
          `[${accountId}] SimpleX file timeout cancel failed: ${String(err)}`
        );
      });
    void dispatchInbound({
      pending: current,
      mediaPath: undefined,
      mediaType: undefined,
    }).catch((err) => {
      current.runtime.error?.(`[${accountId}] SimpleX pending file timeout: ${String(err)}`);
    });
  }, PENDING_FILE_TIMEOUT_MS);
}

export async function finalizePendingFile(params: {
  accountId: string;
  fileId: number;
  filePath?: string;
}): Promise<void> {
  const pending = pendingFiles.get(pendingKey(params.accountId, params.fileId));
  if (!pending) {
    return;
  }
  pendingFiles.delete(pendingKey(params.accountId, params.fileId));
  const mediaPath = params.filePath?.trim() || undefined;
  let mediaType: string | undefined;
  if (mediaPath) {
    mediaType = await getSimplexRuntime().media.detectMime({ filePath: mediaPath });
  }
  await dispatchInbound({ pending, mediaPath, mediaType });
}

export function hasPendingFile(accountId: string, fileId: number): boolean {
  return pendingFiles.has(pendingKey(accountId, fileId));
}

export async function dispatchInbound(params: {
  pending: PendingInboundFile;
  mediaPath?: string;
  mediaType?: string;
}): Promise<void> {
  const { pending, mediaPath, mediaType } = params;
  const core = getSimplexRuntime();
  const ctxPayload = {
    ...pending.ctxPayload,
    MediaPath: mediaPath,
    MediaType: mediaType,
    MediaUrl: mediaPath,
  };

  await core.channel.session.recordInboundSession({
    storePath: pending.storePath,
    sessionKey: (ctxPayload as { SessionKey?: string }).SessionKey ?? pending.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      pending.runtime.error?.(`simplex: failed updating session meta: ${String(err)}`);
    },
  });

  pending.statusSink?.({ lastInboundAt: Date.now() });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: pending.cfg,
    dispatcherOptions: {
      deliver: async (payload) => {
        const hasMedia =
          Boolean(payload.mediaUrl) ||
          (Array.isArray(payload.mediaUrls) && payload.mediaUrls.length > 0);
        if (!payload.text && !hasMedia) {
          return;
        }
        if (!pending.account.enabled || !pending.account.configured) {
          pending.runtime.error?.(
            `[${pending.account.accountId}] SimpleX reply skipped: account not ready (enabled=${pending.account.enabled}, configured=${pending.account.configured})`
          );
          return;
        }
        await pending.sendPayload(payload);
        pending.statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err) => {
        pending.runtime.error?.(
          `[${pending.account.accountId}] SimpleX reply failed: ${String(err)}`
        );
      },
    },
    replyOptions: {
      disableBlockStreaming:
        typeof pending.account.config.blockStreaming === "boolean"
          ? !pending.account.config.blockStreaming
          : undefined,
    },
  });
}
