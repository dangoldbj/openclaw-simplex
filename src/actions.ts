import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionName,
} from "openclaw/plugin-sdk/channel-contract";
import { listEnabledSimplexAccounts, resolveSimplexAccount } from "./accounts.js";
import {
  type SimplexComposedMessage,
  buildAddGroupMemberCommand,
  buildDeleteChatItemCommand,
  buildLeaveGroupCommand,
  buildReactionCommand,
  buildRemoveGroupMemberCommand,
  buildSendMessagesCommand,
  buildUpdateChatItemCommand,
  buildUpdateGroupProfileCommand,
} from "./simplex-commands.js";
import { resolveSimplexCommandError } from "./simplex-errors.js";
import { buildComposedMessages } from "./simplex-media.js";
import { SimplexWsClient } from "./simplex-ws-client.js";
import type { ResolvedSimplexAccount } from "./types.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
};

type SimplexActionParams = Record<string, unknown>;

type DeleteMode = "broadcast" | "internal" | "internalMark";

const SUPPORTED_ACTIONS = new Set<ChannelMessageActionName>([
  "upload-file",
  "react",
  "edit",
  "delete",
  "unsend",
  "renameGroup",
  "addParticipant",
  "removeParticipant",
  "leaveGroup",
]);

function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function buildSimplexMessageToolSchema() {
  return {
    properties: {
      to: Type.Optional(
        Type.String({
          description: "SimpleX target chat reference. Accepts contact or group targets."
        })
      ),
      chatRef: Type.Optional(
        Type.String({
          description: "Explicit SimpleX chat reference such as @contact or #group."
        })
      ),
      chatId: Type.Optional(
        Type.String({
          description: "Alias for the target chat reference."
        })
      ),
      chatType: Type.Optional(
        Type.Union([Type.Literal("direct"), Type.Literal("group")], {
          description: "Disambiguates the target when only an ID is provided."
        }),
      ),
      groupId: Type.Optional(
        Type.String({
          description: "SimpleX group identifier for group actions."
        })
      ),
      messageId: Type.Optional(
        Type.Union([Type.String(), Type.Number()], {
          description: "Single message/chat item ID for react or edit actions."
        })
      ),
      chatItemId: Type.Optional(
        Type.Union([Type.String(), Type.Number()], {
          description: "Alias for messageId."
        })
      ),
      messageIds: Type.Optional(
        Type.Array(Type.Union([Type.String(), Type.Number()]), {
          description: "Multiple message/chat item IDs for delete or unsend actions."
        }),
      ),
      deleteMode: Type.Optional(
        Type.Union(
          [Type.Literal("broadcast"), Type.Literal("internal"), Type.Literal("internalMark")],
          { description: "SimpleX deletion mode." }
        )
      ),
      emoji: Type.Optional(
        Type.String({
          description: "Emoji shorthand for the react action.",
        }),
      ),
      reaction: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description: "Raw SimpleX reaction payload for advanced react actions.",
          },
        ),
      ),
      remove: Type.Optional(
        Type.Boolean({
          description: "When true, remove an existing reaction instead of adding one."
        }),
      ),
      text: Type.Optional(
        Type.String({
          description: "Replacement message text or upload caption.",
        }),
      ),
      message: Type.Optional(
        Type.String({
          description: "Alias for text.",
        }),
      ),
      caption: Type.Optional(
        Type.String({
          description: "Alias for text when uploading a file.",
        }),
      ),
      mediaUrl: Type.Optional(
        Type.String({
          description: "File path or URL to upload via SimpleX.",
        }),
      ),
      media: Type.Optional(
        Type.String({
          description: "Alias for mediaUrl.",
        }),
      ),
      path: Type.Optional(
        Type.String({
          description: "Alias for mediaUrl when providing a local file path.",
        }),
      ),
      filePath: Type.Optional(
        Type.String({
          description: "Alias for mediaUrl when providing a local file path.",
        }),
      ),
      audioAsVoice: Type.Optional(
        Type.Boolean({
          description: "Send uploaded audio as a voice message when compatible.",
        }),
      ),
      asVoice: Type.Optional(
        Type.Boolean({
          description: "Alias for audioAsVoice.",
        }),
      ),
      displayName: Type.Optional(
        Type.String({
          description: "New SimpleX group display name.",
        }),
      ),
      name: Type.Optional(
        Type.String({
          description: "Alias for displayName."
        })
      ),
      title: Type.Optional(
        Type.String({
          description: "Alias for displayName."
        })
      ),
      profile: Type.Optional(
        Type.String({
          description: "JSON-encoded SimpleX group profile for renameGroup."
        })
      ),
      groupProfile: Type.Optional(
        Type.String({
          description: "Alias for profile."
        })
      ),
      participant: Type.Optional(
        Type.String({
          description: "Participant identifier for addParticipant or removeParticipant."
        }),
      ),
      contactId: Type.Optional(
        Type.String({
          description: "Alias for participant when adding a group member."
        }),
      ),
      memberId: Type.Optional(
        Type.String({
          description: "Alias for participant when removing a group member.",
        }),
      ),
    },
  };
}

function readStringParam(
  params: SimplexActionParams,
  key: string,
  options: { required?: boolean; allowEmpty?: boolean } = {}
): string | undefined {
  const raw = params[key];
  if (typeof raw !== "string") {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  const value = raw.trim();
  if (!value && !options.allowEmpty) {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  return value;
}

function readNumberParam(
  params: SimplexActionParams,
  key: string,
  options: { required?: boolean; integer?: boolean } = {}
): number | undefined {
  const raw = params[key];
  let value: number | undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) {
        value = parsed;
      }
    }
  }
  if (value === undefined) {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  return options.integer ? Math.trunc(value) : value;
}

function normalizeSimplexChatRef(raw: string, chatType?: string | null): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  const withoutPrefix = trimmed.toLowerCase().startsWith("simplex:")
    ? trimmed.slice("simplex:".length).trim()
    : trimmed;
  if (!withoutPrefix) {
    return withoutPrefix;
  }
  if (withoutPrefix.startsWith("@") || withoutPrefix.startsWith("#")) {
    return withoutPrefix;
  }
  const lowered = withoutPrefix.toLowerCase();
  if (lowered.startsWith("group:")) {
    const id = withoutPrefix.slice("group:".length).trim();
    return id ? `#${id}` : withoutPrefix;
  }
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    const id = withoutPrefix.slice(withoutPrefix.indexOf(":") + 1).trim();
    return id ? `@${id}` : withoutPrefix;
  }
  if (chatType === "group") {
    return `#${withoutPrefix}`;
  }
  if (chatType === "direct") {
    return `@${withoutPrefix}`;
  }
  return `@${withoutPrefix}`;
}

function normalizeSimplexGroupRef(raw: string): string {
  return normalizeSimplexChatRef(raw, "group");
}

function readChatRef(params: SimplexActionParams): string {
  const raw =
    readStringParam(params, "chatRef") ??
    readStringParam(params, "to") ??
    readStringParam(params, "chatId");
  if (!raw) {
    throw new Error("chatRef or to required");
  }
  const chatType = readStringParam(params, "chatType");
  return normalizeSimplexChatRef(raw, chatType);
}

function readMessageIds(params: SimplexActionParams): Array<number | string> {
  const raw = params.messageIds ?? params.messageId ?? params.chatItemId;
  if (Array.isArray(raw)) {
    const ids = raw
      .map((entry) => (typeof entry === "number" ? entry : String(entry).trim()))
      .filter((entry) => (typeof entry === "number" ? Number.isFinite(entry) : Boolean(entry)));
    if (ids.length > 0) {
      return ids;
    }
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    return [raw];
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      if (trimmed.includes(",")) {
        const parts = trimmed
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          return parts;
        }
      }
      return [trimmed];
    }
  }
  throw new Error("messageId or messageIds required");
}

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
  const rawMessageId =
    resp.chatItems?.[0]?.chatItem?.meta?.itemId ?? resp.messageId ?? resp.itemId;
  if (typeof rawMessageId === "number" && Number.isFinite(rawMessageId)) {
    return { messageId: String(rawMessageId) };
  }
  if (typeof rawMessageId === "string" && rawMessageId.trim()) {
    return { messageId: rawMessageId.trim() };
  }
  return {};
}

function readUploadMediaUrl(params: SimplexActionParams): string | undefined {
  return (
    readStringParam(params, "mediaUrl") ??
    readStringParam(params, "media") ??
    readStringParam(params, "filePath") ??
    readStringParam(params, "path")
  );
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

  if (!SUPPORTED_ACTIONS.has(action)) {
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
    const deleteModeRaw = readStringParam(toolParams, "deleteMode");
    const deleteMode =
      deleteModeRaw &&
      (deleteModeRaw === "broadcast" ||
        deleteModeRaw === "internal" ||
        deleteModeRaw === "internalMark")
        ? (deleteModeRaw as DeleteMode)
        : undefined;
    const cmd = buildDeleteChatItemCommand({
      chatRef,
      chatItemIds: messageIds,
      deleteMode,
    });
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, deleted: messageIds });
  }

  if (action === "renameGroup") {
    const target =
      readStringParam(toolParams, "to") ??
      readStringParam(toolParams, "chatRef") ??
      readStringParam(toolParams, "groupId");
    if (!target) {
      throw new Error("groupId or to required");
    }
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
    const target =
      readStringParam(toolParams, "to") ??
      readStringParam(toolParams, "chatRef") ??
      readStringParam(toolParams, "groupId");
    if (!target) {
      throw new Error("groupId or to required");
    }
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
    const target =
      readStringParam(toolParams, "to") ??
      readStringParam(toolParams, "chatRef") ??
      readStringParam(toolParams, "groupId");
    if (!target) {
      throw new Error("groupId or to required");
    }
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
    const target =
      readStringParam(toolParams, "to") ??
      readStringParam(toolParams, "chatRef") ??
      readStringParam(toolParams, "groupId");
    if (!target) {
      throw new Error("groupId or to required");
    }
    const cmd = buildLeaveGroupCommand(normalizeSimplexGroupRef(target));
    await withSimplexClient(account, (client) => client.sendCommand(cmd));
    return jsonResult({ ok: true, group: target, left: true });
  }

  throw new Error(`Action ${action} not supported for simplex.`);
}

export const simplexMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: ({ cfg }) => {
    const actions = listEnabledSimplexAccounts(cfg).filter((account) => account.configured);
    if (actions.length === 0) {
      return null;
    }
    return {
      actions: [
        "send",
        "upload-file",
        "react",
        "edit",
        "delete",
        "unsend",
        "renameGroup",
        "addParticipant",
        "removeParticipant",
        "leaveGroup",
      ] as const satisfies readonly ChannelMessageActionName[],
      capabilities: [],
      schema: buildSimplexMessageToolSchema(),
    };
  },
  supportsAction: ({ action }) => SUPPORTED_ACTIONS.has(action),
  handleAction: async ({ action, params, cfg, accountId }) =>
    await executeSimplexAction({ action, cfg, accountId, actionParams: params }),
};
