import {
  readStringArrayParam,
  resolvePollMaxSelections,
} from "openclaw/plugin-sdk/channel-actions";
import type { ChannelMessageActionName } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { normalizePollInput } from "openclaw/plugin-sdk/media-runtime";
import { buildComposedMessages } from "../channel/media/simplex-media.js";
import { renderSimplexPollText } from "../channel/messaging/simplex-outbound.js";
import { resolveSimplexChatItemId } from "../simplex/runtime/api.js";
import { withSimplexClient } from "../simplex/runtime/transport.js";
import type { SimplexActionParams, ToolResult } from "../types/actions.js";
import type { ResolvedSimplexAccount } from "../types/config.js";
import type {
  SimplexComposedMessage,
  SimplexDeleteMode,
  SimplexReaction,
} from "../types/simplex.js";
import { assertSimplexReactActionAllowed } from "./discovery.js";
import {
  readDeleteMode,
  readMessageIds,
  readNumberParam,
  readStringParam,
  readUploadMediaUrl,
} from "./params.js";
import { jsonResult } from "./result.js";

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
  ttl?: number;
}): Promise<{ messageId?: string }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const chatItems = await withSimplexClient({
    account: params.account,
    run: (client) =>
      client.sendMessages({
        chatRef: params.chatRef,
        composedMessages: params.composedMessages,
        ttl: params.ttl ?? params.account.config.messageTtlSeconds,
      }),
  });
  // Staged outbound files are reclaimed by the outbound-files reaper once the
  // runtime has had time to read them; the send returning does not mean the
  // async upload is done, so we deliberately do not delete them here.
  return { messageId: resolveSimplexChatItemId(chatItems[0]) };
}

export async function executeSimplexMessageAction(params: {
  action: ChannelMessageActionName;
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  chatRef: string;
  toolParams: SimplexActionParams;
}): Promise<ToolResult | null> {
  const { action, cfg, account, chatRef, toolParams } = params;
  const ttl =
    readNumberParam(toolParams, "messageTtlSeconds", { integer: true }) ??
    readNumberParam(toolParams, "ttl", { integer: true }) ??
    account.config.messageTtlSeconds;

  if (action === "poll") {
    const question =
      readStringParam(toolParams, "pollQuestion", { allowEmpty: false }) ??
      readStringParam(toolParams, "question", { allowEmpty: false });
    if (!question) {
      throw new Error("pollQuestion required");
    }
    const options = readStringArrayParam(toolParams, "pollOption", { required: true }) ?? [];
    if (options.length < 2) {
      throw new Error("pollOption requires at least two values");
    }
    const allowMultiselect =
      typeof toolParams.pollMulti === "boolean" ? toolParams.pollMulti : false;
    const durationHours = readNumberParam(toolParams, "pollDurationHours", { integer: true });
    const normalized = normalizePollInput({
      question,
      options,
      maxSelections: resolvePollMaxSelections(options.length, allowMultiselect),
      durationHours,
    });
    const composedMessages = await buildComposedMessages({
      cfg,
      accountId: account.accountId,
      text: renderSimplexPollText(normalized),
    });
    const result = await sendActionComposedMessages({ account, chatRef, composedMessages, ttl });
    return jsonResult({ ok: true, poll: true, to: chatRef, messageId: result.messageId ?? null });
  }

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
    const result = await sendActionComposedMessages({ account, chatRef, composedMessages, ttl });
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
    const runtimeReaction =
      emoji && !("type" in reaction)
        ? ({ type: "emoji", emoji } as SimplexReaction)
        : (reaction as SimplexReaction);
    await withSimplexClient({
      account,
      run: (client) =>
        client.reactToMessage({
          chatRef,
          messageId,
          add: !remove,
          reaction: runtimeReaction,
        }),
    });
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
    await withSimplexClient({
      account,
      run: (client) =>
        client.editMessage({
          chatRef,
          messageId,
          updatedMessage,
        }),
    });
    return jsonResult({ ok: true, updated: messageId });
  }

  if (action === "delete" || action === "unsend") {
    const messageIds = readMessageIds(toolParams);
    const deleteMode = readDeleteMode(toolParams);
    await withSimplexClient({
      account,
      run: (client) =>
        client.deleteMessages({
          chatRef,
          messageIds,
          deleteMode: (deleteMode ?? "broadcast") as SimplexDeleteMode,
        }),
    });
    return jsonResult({ ok: true, deleted: messageIds });
  }

  return null;
}
