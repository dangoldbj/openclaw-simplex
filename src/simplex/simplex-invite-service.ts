import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../types/config.js";
import type {
  SimplexInviteCreateResult,
  SimplexInviteListResult,
  SimplexInviteMode,
  SimplexInviteRevokeResult,
  SimplexInviteServiceOptions,
} from "../types/invite.js";
import type { SimplexChatApi, SimplexLogger } from "../types/simplex.js";
import { withSimplexApi } from "./simplex-transport.js";

function contactLinkToString(link: unknown): string | null {
  if (!link || typeof link !== "object") {
    return null;
  }
  const record = link as Record<string, unknown>;
  const nested = (record.connLinkContact as Record<string, unknown> | undefined) ?? record;
  const short = nested.connShortLink;
  const full = nested.connFullLink;
  return typeof short === "string" && short
    ? short
    : typeof full === "string" && full
      ? full
      : null;
}

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

async function runInviteOperation<T>(
  account: ResolvedSimplexAccount,
  params: {
    logger?: SimplexLogger;
    run: (userId: number, api: SimplexChatApi) => Promise<T>;
  }
): Promise<T> {
  return await withSimplexApi({
    account,
    logger: params.logger,
    run: async (api) => {
      const user = await api.apiGetActiveUser();
      const userId = user?.userId;
      if (typeof userId !== "number") {
        throw new Error(`SimpleX account "${account.accountId}" has no active user`);
      }
      return await params.run(userId, api);
    },
  });
}

export async function createSimplexInvite(
  params: SimplexInviteServiceOptions & { mode: SimplexInviteMode }
): Promise<SimplexInviteCreateResult> {
  const account = resolveInviteAccount(params.cfg, params.accountId);
  const result = await runInviteOperation(account, {
    logger: params.logger,
    run: async (userId, api) => {
      if (params.mode === "connect") {
        const link = await api.apiCreateLink(userId);
        return { link };
      }
      const existing = await api.apiGetUserAddress(userId);
      const address = existing ?? (await api.apiCreateUserAddress(userId));
      const link = contactLinkToString(address);
      return { link };
    },
  });
  return {
    accountId: account.accountId,
    operation: params.mode === "connect" ? "create-link" : "create-address",
    mode: params.mode,
    link: result.link,
  };
}

export async function listSimplexInvites(
  params: SimplexInviteServiceOptions
): Promise<SimplexInviteListResult> {
  const account = resolveInviteAccount(params.cfg, params.accountId);
  const { addressResponse, contactsResponse, addressLink } = await runInviteOperation(account, {
    logger: params.logger,
    run: async (userId, api) => {
      const [address, contacts] = await Promise.all([
        api.apiGetUserAddress(userId),
        api.apiListContacts(userId),
      ]);
      return {
        addressResponse: address,
        contactsResponse: contacts,
        addressLink: contactLinkToString(address),
      };
    },
  });
  return {
    accountId: account.accountId,
    addressLink,
    links: addressLink ? [addressLink] : [],
    pendingHints: [],
    addressResponse,
    contactsResponse,
  };
}

export async function revokeSimplexInvite(
  params: SimplexInviteServiceOptions
): Promise<SimplexInviteRevokeResult> {
  const account = resolveInviteAccount(params.cfg, params.accountId);
  const revoked = await runInviteOperation(account, {
    logger: params.logger,
    run: async (userId, api) => {
      await api.apiDeleteUserAddress(userId);
      return true;
    },
  });
  return {
    accountId: account.accountId,
    revoked,
  };
}
