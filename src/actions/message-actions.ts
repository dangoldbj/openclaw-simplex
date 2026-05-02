import type { ChannelMessageActionName } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { buildComposedMessages } from "../channel/media/simplex-media.js";
import {
  parseSimplexApiChatRef,
  resolveSimplexChatItemId,
  toSimplexApiChatRef,
  toSimplexApiChatType,
} from "../simplex/runtime/api.js";
import { withSimplexApi } from "../simplex/runtime/transport.js";
import type { SimplexActionParams, ToolResult } from "../types/actions.js";
import type { ResolvedSimplexAccount } from "../types/config.js";
import type {
  SimplexApiComposedMessage,
  SimplexApiDeleteMode,
  SimplexApiMsgContent,
  SimplexApiReaction,
  SimplexComposedMessage,
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
}): Promise<{ messageId?: string }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const apiChatRef = parseSimplexApiChatRef(params.chatRef);
  if (!apiChatRef) {
    throw new Error(`SimpleX chat ref must be numeric for runtime API: ${params.chatRef}`);
  }
  const chatItems = await withSimplexApi({
    account: params.account,
    run: (api) =>
      api.apiSendMessages(
        toSimplexApiChatRef(apiChatRef),
        params.composedMessages as SimplexApiComposedMessage[]
      ),
  });
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
    const apiChatRef = parseSimplexApiChatRef(chatRef);
    if (!apiChatRef) {
      throw new Error(`SimpleX chat ref must be numeric for runtime API: ${chatRef}`);
    }
    const apiReaction =
      emoji && !("type" in reaction)
        ? ({ type: "emoji", emoji } as unknown as SimplexApiReaction)
        : (reaction as unknown as SimplexApiReaction);
    await withSimplexApi({
      account,
      run: (api) =>
        api.apiChatItemReaction(
          toSimplexApiChatType(apiChatRef),
          apiChatRef[1],
          messageId,
          !remove,
          apiReaction
        ),
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
    const apiChatRef = parseSimplexApiChatRef(chatRef);
    if (!apiChatRef) {
      throw new Error(`SimpleX chat ref must be numeric for runtime API: ${chatRef}`);
    }
    await withSimplexApi({
      account,
      run: (api) =>
        api.apiUpdateChatItem(
          toSimplexApiChatType(apiChatRef),
          apiChatRef[1],
          messageId,
          updatedMessage.msgContent as SimplexApiMsgContent,
          false
        ),
    });
    return jsonResult({ ok: true, updated: messageId });
  }

  if (action === "delete" || action === "unsend") {
    const messageIds = readMessageIds(toolParams);
    const deleteMode = readDeleteMode(toolParams);
    const apiChatRef = parseSimplexApiChatRef(chatRef);
    if (!apiChatRef) {
      throw new Error(`SimpleX chat ref must be numeric for runtime API: ${chatRef}`);
    }
    await withSimplexApi({
      account,
      run: (api) =>
        api.apiDeleteChatItems(
          toSimplexApiChatType(apiChatRef),
          apiChatRef[1],
          messageIds.map((id) => Math.trunc(Number(id))),
          (deleteMode ?? "broadcast") as SimplexApiDeleteMode
        ),
    });
    return jsonResult({ ok: true, deleted: messageIds });
  }

  return null;
}
