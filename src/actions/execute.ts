import type { ChannelMessageActionName } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { buildComposedMessages } from "../channel/media/simplex-media.js";
import { resolveSimplexAccount } from "../config/accounts.js";
import {
  parseSimplexApiChatRef,
  parseSimplexNumericId,
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
  SimplexApiGroupMemberRole,
  SimplexApiGroupProfile,
  SimplexApiMsgContent,
  SimplexApiReaction,
  SimplexComposedMessage,
} from "../types/simplex.js";
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
      const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
      if (groupId === null) {
        throw new Error(`SimpleX group id must be numeric for runtime API: ${target}`);
      }
      await withSimplexApi({
        account,
        run: (api) =>
          api.apiUpdateGroupProfile(groupId, profile as unknown as SimplexApiGroupProfile),
      });
      return jsonResult({ ok: true, group: target, profile });
    }
    const displayName =
      readStringParam(toolParams, "displayName") ??
      readStringParam(toolParams, "name") ??
      readStringParam(toolParams, "title");
    if (!displayName) {
      throw new Error("displayName or name required");
    }
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    if (groupId === null) {
      throw new Error(`SimpleX group id must be numeric for runtime API: ${target}`);
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiUpdateGroupProfile(groupId, { displayName } as SimplexApiGroupProfile),
    });
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
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    const contactId = parseSimplexNumericId(participant);
    if (groupId === null || contactId === null) {
      throw new Error("SimpleX group and contact ids must be numeric for runtime API");
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiAddMember(groupId, contactId, "member" as SimplexApiGroupMemberRole),
    });
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
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    const memberId = parseSimplexNumericId(participant);
    if (groupId === null || memberId === null) {
      throw new Error("SimpleX group and member ids must be numeric for runtime API");
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiRemoveMembers(groupId, [memberId]),
    });
    return jsonResult({ ok: true, group: target, removed: participant });
  }

  if (action === "leaveGroup") {
    const target = readGroupTarget(toolParams);
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    if (groupId === null) {
      throw new Error(`SimpleX group id must be numeric for runtime API: ${target}`);
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiLeaveGroup(groupId),
    });
    return jsonResult({ ok: true, group: target, left: true });
  }

  throw new Error(`Action ${action} not supported for simplex.`);
}
