import type { ChannelMessageActionName } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { buildComposedMessages } from "../channel/simplex-media.js";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import {
  buildAddGroupMemberCommand,
  buildDeleteChatItemCommand,
  buildLeaveGroupCommand,
  buildReactionCommand,
  buildRemoveGroupMemberCommand,
  buildSendMessagesCommand,
  buildUpdateChatItemCommand,
  buildUpdateGroupProfileCommand,
  type SimplexComposedMessage,
} from "../simplex/simplex-commands.js";
import { resolveSimplexCommandError } from "../simplex/simplex-errors.js";
import { SimplexWsClient } from "../simplex/simplex-ws-client.js";
import { assertSimplexReactActionAllowed } from "./discovery.js";
import {
  normalizeSimplexGroupRef,
  readChatRef,
  readDeleteMode,
  readGroupTarget,
  readMessageIds,
  readNumberParam,
  readStringParam,
  readUploadMediaUrl,
} from "./params.js";
import { jsonResult } from "./result.js";
import { SIMPLEX_SUPPORTED_ACTIONS } from "./schema.js";
import type { SimplexActionParams, ToolResult } from "./types.js";

async function withSimplexClient<T>(
  account: ResolvedSimplexAccount,
  fn: (client: SimplexWsClient) => Promise<T>
): Promise<T> {
  const client = new SimplexWsClient({
    url: account.wsUrl,
    connectTimeoutMs: account.config.connection?.connectTimeoutMs,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function resolveEditMessage(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  text: string;
}): Promise<SimplexComposedMessage> {
  const composed = await buildComposedMessages({
    cfg: params.cfg,
    accountId: params.account.accountId,
    text: params.text,
  });
  if (composed.length === 0) {
    throw new Error("text required");
  }
  const first = composed[0];
  if (!first) {
    throw new Error("text required");
  }
  return first;
}

async function sendActionComposedMessages(params: {
  account: ResolvedSimplexAccount;
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
}): Promise<{ messageId?: string }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const cmd = buildSendMessagesCommand({
    chatRef: params.chatRef,
    composedMessages: params.composedMessages,
  });
  const response = await withSimplexClient(params.account, (client) => client.sendCommand(cmd));
  const resp = response.resp as {
    type?: string;
    chatError?: { errorType?: { type?: string; message?: string } };
    chatItems?: Array<{ chatItem?: { meta?: { itemId?: unknown } } }>;
    itemId?: unknown;
    messageId?: unknown;
  };
  const commandError = resolveSimplexCommandError(resp);
  if (commandError) {
    throw new Error(commandError);
  }
  const rawMessageId = resp.chatItems?.[0]?.chatItem?.meta?.itemId ?? resp.messageId ?? resp.itemId;
  if (typeof rawMessageId === "number" && Number.isFinite(rawMessageId)) {
    return { messageId: String(rawMessageId) };
  }
  if (typeof rawMessageId === "string" && rawMessageId.trim()) {
    return { messageId: rawMessageId.trim() };
  }
  return {};
}

export async function executeSimplexAction(params: {
  action: ChannelMessageActionName;
  cfg: OpenClawConfig;
  accountId?: string | null;
  actionParams: SimplexActionParams;
}): Promise<ToolResult> {
  const { action, cfg, accountId } = params;
  const toolParams = params.actionParams;

  if (action === "send") {
    throw new Error("Send should be handled by outbound, not actions handler.");
  }

  if (!SIMPLEX_SUPPORTED_ACTIONS.has(action)) {
    throw new Error(`Action ${action} not supported for simplex.`);
  }

  const account = resolveSimplexAccount({ cfg, accountId });
  if (!account.enabled) {
    throw new Error("SimpleX account disabled.");
  }
  if (!account.configured) {
    throw new Error("SimpleX account not configured.");
  }

  const chatRef = readChatRef(toolParams);

  if (action === "upload-file") {
    const mediaUrl = readUploadMediaUrl(toolParams);
    if (!mediaUrl) {
      throw new Error("mediaUrl, media, filePath, or path required");
    }
    const text =
      readStringParam(toolParams, "text", { allowEmpty: true }) ??
      readStringParam(toolParams, "message", { allowEmpty: true }) ??
      readStringParam(toolParams, "caption", { allowEmpty: true }) ??
      "";
    const audioAsVoice =
      typeof toolParams.audioAsVoice === "boolean"
        ? toolParams.audioAsVoice
        : typeof toolParams.asVoice === "boolean"
          ? toolParams.asVoice
          : undefined;
    const composedMessages = await buildComposedMessages({
      cfg,
      accountId: account.accountId,
      text,
      mediaUrl,
      audioAsVoice,
    });
    const result = await sendActionComposedMessages({ account, chatRef, composedMessages });
    return jsonResult({
      ok: true,
      uploaded: true,
      to: chatRef,
      mediaUrl,
      messageId: result.messageId ?? null,
    });
  }

  if (action === "react") {
    assertSimplexReactActionAllowed({ cfg, accountId: account.accountId });
    const messageId =
      readNumberParam(toolParams, "messageId", { integer: true }) ??
      readNumberParam(toolParams, "chatItemId", { integer: true });
    if (messageId === undefined) {
      throw new Error("messageId required");
    }
    const emoji = readStringParam(toolParams, "emoji", { allowEmpty: true });
    const remove = typeof toolParams.remove === "boolean" ? toolParams.remove : false;
    const reaction =
      typeof toolParams.reaction === "object" && toolParams.reaction !== null
        ? (toolParams.reaction as Record<string, unknown>)
        : emoji
          ? { emoji }
          : null;
    if (!reaction) {
      throw new Error("reaction or emoji required");
    }
    const cmd = buildReactionCommand({
      chatRef,
      chatItemId: messageId,
      add: !remove,
      reaction,
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, action: remove ? "removed" : "added", emoji });
  }

  if (action === "edit") {
    const messageId =
      readNumberParam(toolParams, "messageId", { integer: true }) ??
      readNumberParam(toolParams, "chatItemId", { integer: true });
    if (messageId === undefined) {
      throw new Error("messageId required");
    }
    const text =
      readStringParam(toolParams, "text", { allowEmpty: false }) ??
      readStringParam(toolParams, "message", { allowEmpty: false });
    if (!text) {
      throw new Error("text required");
    }
    const updatedMessage = await resolveEditMessage({ cfg, account, text });
    const cmd = buildUpdateChatItemCommand({
      chatRef,
      chatItemId: messageId,
      updatedMessage,
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, updated: messageId });
  }

  if (action === "delete" || action === "unsend") {
    const messageIds = readMessageIds(toolParams);
    const cmd = buildDeleteChatItemCommand({
      chatRef,
      chatItemIds: messageIds,
      deleteMode: readDeleteMode(toolParams),
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, deleted: messageIds });
  }

  if (action === "renameGroup") {
    const target = readGroupTarget(toolParams);
    const rawProfile =
      readStringParam(toolParams, "profile") ?? readStringParam(toolParams, "groupProfile");
    if (rawProfile) {
      let profile: Record<string, unknown>;
      try {
        profile = JSON.parse(rawProfile) as Record<string, unknown>;
      } catch (err) {
        throw new Error(`Invalid profile JSON: ${String(err)}`, { cause: err });
      }
      const cmd = buildUpdateGroupProfileCommand({
        groupId: normalizeSimplexGroupRef(target),
        profile,
      });
      await withSimplexClient(account, (client) => client.sendCommand(cmd));
      return jsonResult({ ok: true, group: target, profile });
    }
    const displayName =
      readStringParam(toolParams, "displayName") ??
      readStringParam(toolParams, "name") ??
      readStringParam(toolParams, "title");
    if (!displayName) {
      throw new Error("displayName or name required");
    }
    const cmd = buildUpdateGroupProfileCommand({
      groupId: normalizeSimplexGroupRef(target),
      profile: { displayName },
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, group: target, displayName });
  }

  if (action === "addParticipant") {
    const target = readGroupTarget(toolParams);
    const participant =
      readStringParam(toolParams, "participant") ??
      readStringParam(toolParams, "contactId") ??
      readStringParam(toolParams, "memberId");
    if (!participant) {
      throw new Error("participant or contactId required");
    }
    const cmd = buildAddGroupMemberCommand({
      groupId: normalizeSimplexGroupRef(target),
      contactId: participant,
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, group: target, added: participant });
  }

  if (action === "removeParticipant") {
    const target = readGroupTarget(toolParams);
    const participant =
      readStringParam(toolParams, "participant") ??
      readStringParam(toolParams, "memberId") ??
      readStringParam(toolParams, "contactId");
    if (!participant) {
      throw new Error("participant or memberId required");
    }
    const cmd = buildRemoveGroupMemberCommand({
      groupId: normalizeSimplexGroupRef(target),
      memberId: participant,
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, group: target, removed: participant });
  }

  if (action === "leaveGroup") {
    const target = readGroupTarget(toolParams);
    const cmd = buildLeaveGroupCommand(normalizeSimplexGroupRef(target));
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, group: target, left: true });
  }

  throw new Error(`Action ${action} not supported for simplex.`);
}
