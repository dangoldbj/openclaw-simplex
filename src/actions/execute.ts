import type { ChannelMessageActionName } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { SimplexActionParams, ToolResult } from "../types/actions.js";
import { executeSimplexGroupAction } from "./group-actions.js";
import { executeSimplexMessageAction } from "./message-actions.js";
import { readChatRef } from "./params.js";
import { SIMPLEX_SUPPORTED_ACTIONS } from "./schema.js";

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
  const messageResult = await executeSimplexMessageAction({
    action,
    cfg,
    account,
    chatRef,
    toolParams,
  });
  if (messageResult) {
    return messageResult;
  }

  const groupResult = await executeSimplexGroupAction({
    action,
    account,
    toolParams,
  });
  if (groupResult) {
    return groupResult;
  }

  throw new Error(`Action ${action} not supported for simplex.`);
}
