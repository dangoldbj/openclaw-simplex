import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk/channel-contract";
import { listEnabledSimplexAccounts } from "../config/accounts.js";
import { executeSimplexAction } from "./execute.js";
import {
  buildSimplexMessageToolSchema,
  SIMPLEX_MESSAGE_TOOL_ACTIONS,
  SIMPLEX_SUPPORTED_ACTIONS,
} from "./schema.js";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractSimplexToolSend(args: Record<string, unknown>) {
  const action = readString(args.action);
  if (action !== "send" && action !== "upload-file") {
    return null;
  }
  const to = readString(args.to) ?? readString(args.chatRef) ?? readString(args.chatId);
  if (!to) {
    return null;
  }
  const accountId = readString(args.accountId);
  const threadId =
    typeof args.threadId === "number" ? String(args.threadId) : readString(args.threadId);
  return { to, accountId, threadId };
}

export const simplexMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: ({ cfg }) => {
    const actions = listEnabledSimplexAccounts(cfg).filter((account) => account.configured);
    if (actions.length === 0) {
      return null;
    }
    return {
      actions: ["poll", ...SIMPLEX_MESSAGE_TOOL_ACTIONS],
      capabilities: ["presentation"],
      schema: buildSimplexMessageToolSchema(),
      mediaSourceParams: {
        "upload-file": ["mediaUrl", "media", "path", "filePath"],
      },
    };
  },
  supportsAction: ({ action }) => SIMPLEX_SUPPORTED_ACTIONS.has(action),
  messageActionTargetAliases: {
    send: { aliases: ["chatRef", "chatId"] },
    "upload-file": { aliases: ["chatRef", "chatId"] },
    react: { aliases: ["chatRef", "chatId"] },
    edit: { aliases: ["chatRef", "chatId"] },
    delete: { aliases: ["chatRef", "chatId"] },
    unsend: { aliases: ["chatRef", "chatId"] },
    renameGroup: { aliases: ["groupId", "chatRef", "chatId"] },
    addParticipant: { aliases: ["groupId", "chatRef", "chatId"] },
    removeParticipant: { aliases: ["groupId", "chatRef", "chatId"] },
    leaveGroup: { aliases: ["groupId", "chatRef", "chatId"] },
  },
  extractToolSend: ({ args }) => extractSimplexToolSend(args),
  handleAction: async ({ action, params, cfg, accountId }) =>
    await executeSimplexAction({ action, cfg, accountId, actionParams: params }),
};
