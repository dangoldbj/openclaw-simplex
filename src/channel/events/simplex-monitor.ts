import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { formatSimplexChatRef, parseSimplexNumericId } from "../../simplex/runtime/api.js";
import { SimplexClient } from "../../simplex/runtime/client.js";
import { recordSimplexContactRequest } from "../../simplex/state/contact-requests.js";
import { markSimplexEventSeen } from "../../simplex/state/event-dedupe.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatItem } from "../../types/events.js";
import type { SimplexChatEvent } from "../../types/simplex.js";
import { buildComposedMessages, resolveSimplexMediaMaxBytes } from "../media/simplex-media.js";
import { sendSimplexComposedMessages } from "../messaging/simplex-send.js";
import { getSimplexRuntime } from "../runtime.js";
import { connectSimplexWithRetry } from "../transport/simplex-connect.js";
import {
  isInboundSimplexChatItem,
  normalizeSimplexSenderId,
  resolveSimplexChatContext,
  resolveSimplexMessageText,
} from "./simplex-event-parser.js";
import { resolveSimplexInboundAccess } from "./simplex-inbound-auth.js";
import { buildSimplexInboundDispatchContext } from "./simplex-inbound-context.js";
import {
  dispatchInbound,
  finalizePendingFile,
  hasPendingFile,
  type PendingInboundFile,
  queuePendingFile,
  requestFileDownload,
} from "./simplex-inbound-files.js";

export type SimplexMonitorOpts = {
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

async function sendSimplexPayload(params: {
  client: SimplexClient;
  chatRef: string;
  cfg: OpenClawConfig;
  accountId: string;
  payload: {
    text?: string;
    mediaUrl?: string;
    mediaUrls?: string[];
    audioAsVoice?: boolean;
    replyToId?: string | number | null;
  };
}): Promise<{ messageId?: string }> {
  const quotedItemId =
    params.payload.replyToId === undefined || params.payload.replyToId === null
      ? undefined
      : parseSimplexNumericId(params.payload.replyToId);
  const composedMessages = await buildComposedMessages({
    cfg: params.cfg,
    accountId: params.accountId,
    text: params.payload.text,
    mediaUrl: params.payload.mediaUrl,
    mediaUrls: params.payload.mediaUrls,
    audioAsVoice: params.payload.audioAsVoice,
    quotedItemId: quotedItemId ?? undefined,
  });
  if (composedMessages.length === 0) {
    return {};
  }
  return await sendSimplexComposedMessages({
    chatRef: params.chatRef,
    composedMessages,
    send: (apiChatRef, messages) =>
      params.client.withApi((api) => api.apiSendMessages(apiChatRef, messages)),
  });
}

export async function startSimplexMonitor(params: SimplexMonitorOpts): Promise<{
  client: SimplexClient;
}> {
  const { account, cfg, runtime, statusSink } = params;
  const client = new SimplexClient({
    account,
    logger: {
      info: (message) => runtime?.log?.(message),
      warn: (message) => runtime?.error?.(message),
      error: (message) => runtime?.error?.(message),
    },
  });

  const stopConnectionState = client.onConnectionState((state) => {
    if (state.connected) {
      statusSink?.({
        connected: true,
        running: true,
        lastConnectedAt: state.at,
        lastDisconnect: null,
        lastError: null,
        healthState: "healthy",
      });
      return;
    }

    statusSink?.({
      connected: false,
      running: state.expected ? false : undefined,
      lastDisconnect: state.error ? { at: state.at, error: state.error } : { at: state.at },
      ...(state.error ? { lastError: state.error } : {}),
      healthState: state.expected ? "stopped" : "disconnected",
    });
  });

  await connectSimplexWithRetry({
    client,
    runtime,
    accountId: account.accountId,
    abortSignal: params.abortSignal,
  });

  const stopListening = client.onEvent(async (event) => {
    try {
      await handleSimplexEvent({ event, account, cfg, runtime, statusSink, client });
    } catch (err) {
      runtime.error?.(`[${account.accountId}] SimpleX event error: ${String(err)}`);
    }
  });

  params.abortSignal.addEventListener(
    "abort",
    () => {
      stopConnectionState();
      stopListening();
      client.close().catch((err) => {
        runtime.error?.(`[${account.accountId}] SimpleX close failed: ${String(err)}`);
      });
    },
    { once: true }
  );

  return { client };
}

async function handleSimplexEvent(params: {
  event: SimplexChatEvent;
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
  client: SimplexClient;
}): Promise<void> {
  const { event, account, cfg, runtime, statusSink, client } = params;
  statusSink?.({ lastEventAt: Date.now() });
  if (event.type === "receivedContactRequest") {
    await recordSimplexContactRequest({
      accountId: account.accountId,
      contactRequest: (event as { contactRequest?: unknown }).contactRequest,
    });
    return;
  }

  if (event.type === "rcvFileDescrReady") {
    const fileId = Number(
      (event as { rcvFileTransfer?: { fileId?: number } })?.rcvFileTransfer?.fileId
    );
    if (Number.isFinite(fileId)) {
      await requestFileDownload({ fileId, account, client, runtime });
    }
    return;
  }

  if (event.type === "rcvFileComplete") {
    const chatItem = (event as { chatItem?: SimplexChatItem })?.chatItem;
    const file = chatItem?.chatItem?.file;
    const fileId = typeof file?.fileId === "number" ? file.fileId : null;
    if (fileId && hasPendingFile(account.accountId, fileId)) {
      const filePath = file?.fileSource?.filePath?.trim();
      await finalizePendingFile({
        accountId: account.accountId,
        fileId,
        filePath,
      });
    }
    return;
  }

  if (event.type !== "newChatItems") {
    return;
  }

  const chatItems = event.chatItems;
  const items = Array.isArray(chatItems) ? (chatItems as SimplexChatItem[]) : [];

  for (const item of items) {
    if (!isInboundSimplexChatItem(item)) {
      continue;
    }

    const context = resolveSimplexChatContext(item);
    if (!context) {
      continue;
    }

    const content =
      item.chatItem?.content?.type === "rcvMsgContent"
        ? item.chatItem?.content?.msgContent
        : undefined;

    if (!content) {
      continue;
    }

    const rawBody = resolveSimplexMessageText(content, item.chatItem?.file?.fileName);
    if (!rawBody) {
      continue;
    }

    const currentMessageId =
      typeof item.chatItem?.meta?.itemId === "number" ? item.chatItem.meta.itemId : undefined;

    const normalizedSenderId = normalizeSimplexSenderId(context.senderId);
    const dmPeerId = normalizedSenderId ?? String(context.chatId);
    const chatRef = formatSimplexChatRef({
      type: context.chatType,
      id: context.chatType === "group" ? context.chatId : dmPeerId,
    });

    if (
      currentMessageId !== undefined &&
      !(await markSimplexEventSeen({
        accountId: account.accountId,
        chatId: context.chatId,
        messageId: currentMessageId,
      }))
    ) {
      continue;
    }

    const core = getSimplexRuntime();

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: SIMPLEX_CHANNEL_ID,
      accountId: account.accountId,
      peer: {
        kind: context.chatType === "group" ? "group" : "direct",
        id: context.chatType === "group" ? String(context.chatId) : dmPeerId,
      },
    });

    const access = await resolveSimplexInboundAccess({
      account,
      cfg,
      runtime,
      core,
      context,
      rawBody,
      normalizedSenderId,
      routeAgentId: route.agentId,
      replyToPairingRequest: async (text) => {
        await sendSimplexPayload({
          client,
          chatRef,
          cfg,
          accountId: account.accountId,
          payload: {
            text,
            replyToId: currentMessageId,
          },
        });
        statusSink?.({ lastOutboundAt: Date.now() });
      },
    });
    if (!access.allowed) {
      continue;
    }

    const { ctxPayload, storePath } = buildSimplexInboundDispatchContext({
      core,
      cfg,
      context,
      route,
      rawBody,
      dmPeerId,
      currentMessageId,
      effectiveWasMentioned: access.effectiveWasMentioned,
      commandAuthorized: access.commandAuthorized,
    });

    const fileId = item.chatItem?.file?.fileId;
    const fileSize = item.chatItem?.file?.fileSize;
    const maxBytes = resolveSimplexMediaMaxBytes({
      cfg,
      accountId: account.accountId,
    });

    const pending: PendingInboundFile = {
      fileId: typeof fileId === "number" ? fileId : -1,
      ctxPayload,
      storePath,
      sessionKey: route.sessionKey,
      account,
      cfg,
      runtime,
      client,
      sendPayload: async (payload) => {
        await sendSimplexPayload({
          client,
          chatRef,
          cfg,
          accountId: account.accountId,
          payload: { ...payload, replyToId: currentMessageId },
        });
      },
      statusSink,
    };

    if (typeof fileId === "number") {
      if (typeof fileSize === "number" && fileSize > maxBytes) {
        runtime.error?.(
          `[${account.accountId}] SimpleX file ${fileId} exceeds limit (${fileSize} > ${maxBytes})`
        );
        continue;
      }
      const accepted = await requestFileDownload({ fileId, account, client, runtime });
      if (accepted) {
        queuePendingFile({ pending, accountId: account.accountId, fileId });
        continue;
      }
    }

    await dispatchInbound({ pending, mediaPath: undefined, mediaType: undefined });
  }
}
