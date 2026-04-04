import type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk/channel-contract";
import { listEnabledSimplexAccounts } from "../config/accounts.js";
import { executeSimplexAction } from "./execute.js";
import {
  buildSimplexMessageToolSchema,
  SIMPLEX_MESSAGE_TOOL_ACTIONS,
  SIMPLEX_SUPPORTED_ACTIONS,
} from "./schema.js";

export const simplexMessageActions: ChannelMessageActionAdapter = {
  describeMessageTool: ({ cfg }) => {
    const actions = listEnabledSimplexAccounts(cfg).filter((account) => account.configured);
    if (actions.length === 0) {
      return null;
    }
    return {
      actions: SIMPLEX_MESSAGE_TOOL_ACTIONS,
      capabilities: [],
      schema: buildSimplexMessageToolSchema(),
    };
  },
  supportsAction: ({ action }) => SIMPLEX_SUPPORTED_ACTIONS.has(action),
  handleAction: async ({ action, params, cfg, accountId }) =>
    await executeSimplexAction({ action, cfg, accountId, actionParams: params }),
};
