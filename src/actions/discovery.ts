import { createActionGate } from "openclaw/plugin-sdk/channel-actions";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveReactionLevel } from "openclaw/plugin-sdk/status-helpers";
import { listEnabledSimplexAccounts, resolveSimplexAccount } from "../config/accounts.js";
import type { SimplexAccountScope } from "../types/config.js";

function areSimplexPollsEnabled(params: { cfg: OpenClawConfig; accountId?: string | null }) {
  const account = resolveSimplexAccount(params);
  return createActionGate(account.config.actions)("polls");
}

function areSimplexAgentReactionsEnabled(params: SimplexAccountScope) {
  const account = resolveSimplexAccount(params);
  if (!createActionGate(account.config.actions)("reactions")) {
    return false;
  }
  return resolveSimplexReactionLevel(params).agentReactionsEnabled;
}

export function resolveSimplexReactionLevel(params: SimplexAccountScope) {
  const account = resolveSimplexAccount(params);
  return resolveReactionLevel({
    value: account.config.reactionLevel,
    defaultLevel: "minimal",
    invalidFallback: "minimal",
  });
}

export function resolveSimplexAgentReactionGuidance(params: SimplexAccountScope) {
  if (!areSimplexAgentReactionsEnabled(params)) {
    return undefined;
  }
  return resolveSimplexReactionLevel(params).agentReactionGuidance;
}

export function describeSimplexMessageActions(
  params: SimplexAccountScope
): Array<
  | "poll"
  | "react"
  | "send"
  | "upload-file"
  | "edit"
  | "delete"
  | "unsend"
  | "renameGroup"
  | "addParticipant"
  | "removeParticipant"
  | "leaveGroup"
> | null {
  const configuredAccounts = params.accountId
    ? [resolveSimplexAccount(params)].filter((account) => account.enabled && account.configured)
    : listEnabledSimplexAccounts(params.cfg).filter((account) => account.configured);
  if (configuredAccounts.length === 0) {
    return null;
  }
  const actions: Array<
    | "send"
    | "upload-file"
    | "edit"
    | "delete"
    | "unsend"
    | "renameGroup"
    | "addParticipant"
    | "removeParticipant"
    | "leaveGroup"
    | "poll"
    | "react"
  > = [
    "send",
    "upload-file",
    "edit",
    "delete",
    "unsend",
    "renameGroup",
    "addParticipant",
    "removeParticipant",
    "leaveGroup",
  ];
  if (
    configuredAccounts.some((account) =>
      areSimplexPollsEnabled({ cfg: params.cfg, accountId: account.accountId })
    )
  ) {
    actions.splice(2, 0, "poll");
  }
  if (
    configuredAccounts.some((account) =>
      areSimplexAgentReactionsEnabled({ cfg: params.cfg, accountId: account.accountId })
    )
  ) {
    actions.splice(actions.includes("poll") ? 3 : 2, 0, "react");
  }
  return actions;
}

export function assertSimplexReactActionAllowed(params: SimplexAccountScope) {
  const account = resolveSimplexAccount(params);
  if (!createActionGate(account.config.actions)("reactions")) {
    throw new Error("SimpleX reactions are disabled via actions.reactions.");
  }
  const reactionLevel = resolveSimplexReactionLevel(params);
  if (!reactionLevel.agentReactionsEnabled) {
    throw new Error(
      `SimpleX agent reactions disabled (reactionLevel="${reactionLevel.level}"). Set channels.openclaw-simplex.reactionLevel to "minimal" or "extensive" to enable.`
    );
  }
}
