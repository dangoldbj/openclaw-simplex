import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveInboundMentionDecision } from "openclaw/plugin-sdk/channel-inbound";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import {
  formatSimplexChatRef,
  parseSimplexApiChatRef,
  parseSimplexNumericId,
  resolveSimplexChatItemId,
  toSimplexApiChatRef,
} from "../../simplex/simplex-api.js";
import { recordSimplexContactRequest } from "../../simplex/simplex-contact-requests.js";
import { markSimplexEventSeen } from "../../simplex/simplex-event-state.js";
import { SimplexNodeClient } from "../../simplex/simplex-node-client.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatItem } from "../../types/events.js";
import type { SimplexApiComposedMessage, SimplexChatEvent } from "../../types/simplex.js";
import { buildComposedMessages, resolveSimplexMediaMaxBytes } from "../media/simplex-media.js";
import { getSimplexRuntime } from "../runtime.js";
import { isSimplexAllowlisted } from "../security/simplex-security.js";
import { connectSimplexWithRetry } from "../transport/simplex-connect.js";
import {
  isInboundSimplexChatItem,
  normalizeSimplexSenderId,
  resolveSimplexChatContext,
  resolveSimplexMessageText,
} from "./simplex-event-parser.js";
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

function resolveSimplexGroupRequireMention(params: {
  account: ResolvedSimplexAccount;
  groupId?: number | null;
}): boolean {
  const groupId = params.groupId ? String(params.groupId) : undefined;
  const groups = params.account.config.groups ?? {};
  const entry = groupId ? groups[groupId] : undefined;
  const fallback = groups["*"];
  if (typeof entry?.requireMention === "boolean") {
    return entry.requireMention;
  }
  if (typeof fallback?.requireMention === "boolean") {
    return fallback.requireMention;
  }
  return true;
}

async function sendSimplexPayload(params: {
  client: SimplexNodeClient;
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
}): Promise<{ messageId?: number }> {
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
  const apiChatRef = parseSimplexApiChatRef(params.chatRef);
  if (!apiChatRef) {
    throw new Error(`SimpleX chat ref must be numeric for runtime API: ${params.chatRef}`);
  }
  const chatItems = await params.client.withApi((api) =>
    api.apiSendMessages(
      toSimplexApiChatRef(apiChatRef),
      composedMessages as SimplexApiComposedMessage[]
    )
  );
  const messageId = resolveSimplexChatItemId(chatItems[0]);
  return { messageId: messageId ? Number(messageId) : undefined };
}

export async function startSimplexMonitor(params: SimplexMonitorOpts): Promise<{
  client: SimplexNodeClient;
}> {
  const { account, cfg, runtime, statusSink } = params;
  const client = new SimplexNodeClient({
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
  client: SimplexNodeClient;
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

    const isGroup = context.chatType === "group";
    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
    const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
    const configAllowFrom = (account.config.allowFrom ?? []).map((entry) => String(entry));
    const configGroupAllowFrom = (account.config.groupAllowFrom ?? []).map((entry) =>
      String(entry)
    );
    const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, cfg);
    const shouldLoadAllowFromStore =
      (!isGroup && (dmPolicy !== "open" || shouldComputeAuth)) ||
      (isGroup && (groupPolicy !== "open" || shouldComputeAuth));
    const storeAllowFrom = shouldLoadAllowFromStore
      ? await core.channel.pairing
          .readAllowFromStore({
            channel: SIMPLEX_CHANNEL_ID,
            accountId: account.accountId,
          })
          .catch(() => [])
      : [];
    const effectiveDmAllowFrom = [...configAllowFrom, ...storeAllowFrom];
    const baseGroupAllowFrom =
      configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom;
    const effectiveGroupAllowFrom = [...baseGroupAllowFrom, ...storeAllowFrom];
    const allowlistForCommands = isGroup ? effectiveGroupAllowFrom : effectiveDmAllowFrom;
    const senderAllowedForCommands = isSimplexAllowlisted({
      allowFrom: allowlistForCommands,
      senderId: normalizedSenderId,
      groupId: String(context.chatId),
      allowGroupId: isGroup,
    });
    const useAccessGroups = cfg.commands?.useAccessGroups !== false;
    const commandAuthorized = shouldComputeAuth
      ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
          useAccessGroups,
          authorizers: [
            {
              configured: allowlistForCommands.length > 0,
              allowed: senderAllowedForCommands,
            },
          ],
        })
      : undefined;

    if (isGroup) {
      if (groupPolicy === "disabled") {
        runtime.log?.(`[${account.accountId}] SimpleX drop group (groupPolicy=disabled)`);
        continue;
      }
      if (groupPolicy === "allowlist") {
        if (effectiveGroupAllowFrom.length === 0) {
          runtime.log?.(
            `[${account.accountId}] SimpleX drop group (groupPolicy=allowlist, empty allowlist)`
          );
          continue;
        }
        const allowed = isSimplexAllowlisted({
          allowFrom: effectiveGroupAllowFrom,
          senderId: normalizedSenderId,
          groupId: String(context.chatId),
          allowGroupId: true,
        });
        if (!allowed) {
          runtime.log?.(
            `[${account.accountId}] SimpleX drop group sender ${context.senderId ?? "unknown"} (not allowlisted)`
          );
          continue;
        }
      }
    } else {
      if (dmPolicy !== "open") {
        const allowed = isSimplexAllowlisted({
          allowFrom: effectiveDmAllowFrom,
          senderId: normalizedSenderId,
          allowGroupId: false,
        });
        if (!allowed) {
          if (dmPolicy === "pairing") {
            const senderId = normalizedSenderId ?? String(context.chatId);
            const { code, created } = await core.channel.pairing.upsertPairingRequest({
              channel: SIMPLEX_CHANNEL_ID,
              id: senderId,
              accountId: account.accountId,
              meta: { name: context.senderName },
            });
            if (created) {
              runtime.log?.(`[${account.accountId}] SimpleX pairing request sender=${senderId}`);
              try {
                await sendSimplexPayload({
                  client,
                  chatRef,
                  cfg,
                  accountId: account.accountId,
                  payload: {
                    text: core.channel.pairing.buildPairingReply({
                      channel: SIMPLEX_CHANNEL_ID,
                      idLine: `Your SimpleX contact id: ${senderId}`,
                      code,
                    }),
                    replyToId: currentMessageId,
                  },
                });
                statusSink?.({ lastOutboundAt: Date.now() });
              } catch (err) {
                runtime.error?.(
                  `[${account.accountId}] SimpleX pairing reply failed: ${String(err)}`
                );
              }
            }
          } else {
            runtime.log?.(
              `[${account.accountId}] SimpleX drop DM from ${context.senderId ?? "unknown"} (dmPolicy=${dmPolicy})`
            );
          }
          continue;
        }
      }
    }

    let effectiveWasMentioned: boolean | undefined;
    if (isGroup) {
      const requireMention = resolveSimplexGroupRequireMention({
        account,
        groupId: context.chatId,
      });
      const mentionRegexes = core.channel.mentions.buildMentionRegexes(cfg, route.agentId);
      const wasMentioned = core.channel.mentions.matchesMentionPatterns(rawBody, mentionRegexes);
      const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
        cfg,
        surface: SIMPLEX_CHANNEL_ID,
      });
      const mentionGate = resolveInboundMentionDecision({
        facts: {
          canDetectMention: mentionRegexes.length > 0,
          wasMentioned,
        },
        policy: {
          isGroup: true,
          requireMention,
          allowTextCommands,
          hasControlCommand: core.channel.text.hasControlCommand(rawBody, cfg),
          commandAuthorized: commandAuthorized === true,
        },
      });
      effectiveWasMentioned = mentionGate.effectiveWasMentioned;
      if (mentionGate.shouldSkip) {
        runtime.log?.(
          `[${account.accountId}] SimpleX drop group ${context.chatId} (mention required)`
        );
        continue;
      }
    }

    if (isGroup && core.channel.commands.isControlCommandMessage(rawBody, cfg)) {
      if (commandAuthorized !== true) {
        runtime.log?.(
          `[${account.accountId}] SimpleX drop control command from ${context.senderId ?? "unknown"}`
        );
        continue;
      }
    }

    const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
      agentId: route.agentId,
    });

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
    const previousTimestamp = core.channel.session.readSessionUpdatedAt({
      storePath,
      sessionKey: route.sessionKey,
    });

    const fromLabel =
      context.chatType === "group"
        ? `group:${context.chatId}`
        : context.senderName || `contact:${context.senderId ?? "unknown"}`;

    const body = core.channel.reply.formatAgentEnvelope({
      channel: "SimpleX",
      from: fromLabel,
      previousTimestamp,
      envelope: envelopeOptions,
      body: rawBody,
    });

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: rawBody,
      CommandBody: rawBody,
      From:
        context.chatType === "group"
          ? `${SIMPLEX_CHANNEL_ID}:group:${context.chatId}`
          : `${SIMPLEX_CHANNEL_ID}:${dmPeerId}`,
      To:
        context.chatType === "group"
          ? `${SIMPLEX_CHANNEL_ID}:group:${context.chatId}`
          : `${SIMPLEX_CHANNEL_ID}:${dmPeerId}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: context.chatType === "group" ? "group" : "direct",
      ConversationLabel: fromLabel,
      GroupSubject: context.chatType === "group" ? context.chatLabel : undefined,
      SenderName: context.senderName,
      SenderId: context.senderId,
      Provider: SIMPLEX_CHANNEL_ID,
      Surface: SIMPLEX_CHANNEL_ID,
      MessageSid: currentMessageId !== undefined ? String(currentMessageId) : undefined,
      CurrentMessageId: currentMessageId !== undefined ? String(currentMessageId) : undefined,
      WasMentioned: context.chatType === "group" ? effectiveWasMentioned : undefined,
      CommandAuthorized: commandAuthorized,
      OriginatingChannel: SIMPLEX_CHANNEL_ID,
      OriginatingTo:
        context.chatType === "group"
          ? `${SIMPLEX_CHANNEL_ID}:group:${context.chatId}`
          : `${SIMPLEX_CHANNEL_ID}:${dmPeerId}`,
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
