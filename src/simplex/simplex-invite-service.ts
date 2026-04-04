import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import { INVITE_COMMANDS, type SimplexInviteMode } from "./simplex-invite.js";
import {
  extractSimplexLink,
  extractSimplexLinks,
  extractSimplexPendingHints,
} from "./simplex-links.js";
import {
  type SimplexLogger,
  sendSimplexCommand,
  sendSimplexCommandWithRetry,
} from "./simplex-transport.js";
import type { SimplexWsResponse } from "./simplex-ws-client.js";

type RunningStateResolver = () => boolean;
type ChannelStarter = () => Promise<void>;

export type SimplexInviteServiceOptions = {
  cfg: OpenClawConfig;
  accountId?: string | null;
  logger?: SimplexLogger;
  startChannel?: ChannelStarter;
  isRunning?: RunningStateResolver;
};

export type SimplexInviteCreateResult = {
  accountId: string;
  command: string;
  mode: SimplexInviteMode;
  link: string | null;
  response: SimplexWsResponse;
};

export type SimplexInviteListResult = {
  accountId: string;
  addressLink: string | null;
  links: string[];
  pendingHints: string[];
  addressResponse: SimplexWsResponse;
  contactsResponse: SimplexWsResponse;
};

export type SimplexInviteRevokeResult = {
  accountId: string;
  response: SimplexWsResponse;
};

function resolveInviteAccount(
  cfg: OpenClawConfig,
  rawAccountId?: string | null
): ResolvedSimplexAccount {
  const explicit = rawAccountId?.trim();
  const accountId = explicit || resolveDefaultSimplexAccountId(cfg);
  const account = resolveSimplexAccount({ cfg, accountId });
  if (!account.enabled) {
    throw new Error(`SimpleX account "${accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${accountId}" is not configured`);
  }
  return account;
}

async function runInviteCommand(
  account: ResolvedSimplexAccount,
  params: {
    command: string;
    logger?: SimplexLogger;
    startChannel?: ChannelStarter;
    isRunning?: RunningStateResolver;
  }
): Promise<SimplexWsResponse> {
  if (params.startChannel || params.isRunning) {
    return await sendSimplexCommandWithRetry({
      account,
      command: params.command,
      logger: params.logger,
      startChannel: params.startChannel,
      isRunning: params.isRunning,
    });
  }
  return await sendSimplexCommand({
    account,
    command: params.command,
    logger: params.logger,
  });
}

export async function createSimplexInvite(
  params: SimplexInviteServiceOptions & { mode: SimplexInviteMode }
): Promise<SimplexInviteCreateResult> {
  const account = resolveInviteAccount(params.cfg, params.accountId);
  const command = INVITE_COMMANDS[params.mode];
  const response = await runInviteCommand(account, {
    command,
    logger: params.logger,
    startChannel: params.startChannel,
    isRunning: params.isRunning,
  });
  return {
    accountId: account.accountId,
    command,
    mode: params.mode,
    link: extractSimplexLink(response),
    response,
  };
}

export async function listSimplexInvites(
  params: SimplexInviteServiceOptions
): Promise<SimplexInviteListResult> {
  const account = resolveInviteAccount(params.cfg, params.accountId);
  const [addressResponse, contactsResponse] = await Promise.all([
    runInviteCommand(account, {
      command: "/show_address",
      logger: params.logger,
      startChannel: params.startChannel,
      isRunning: params.isRunning,
    }),
    runInviteCommand(account, {
      command: "/contacts",
      logger: params.logger,
      startChannel: params.startChannel,
      isRunning: params.isRunning,
    }),
  ]);
  return {
    accountId: account.accountId,
    addressLink: extractSimplexLink(addressResponse),
    links: [
      ...new Set([
        ...extractSimplexLinks(addressResponse),
        ...extractSimplexLinks(contactsResponse),
      ]),
    ],
    pendingHints: extractSimplexPendingHints(contactsResponse),
    addressResponse,
    contactsResponse,
  };
}

export async function revokeSimplexInvite(
  params: SimplexInviteServiceOptions
): Promise<SimplexInviteRevokeResult> {
  const account = resolveInviteAccount(params.cfg, params.accountId);
  const response = await runInviteCommand(account, {
    command: "/delete_address",
    logger: params.logger,
    startChannel: params.startChannel,
    isRunning: params.isRunning,
  });
  return {
    accountId: account.accountId,
    response,
  };
}
