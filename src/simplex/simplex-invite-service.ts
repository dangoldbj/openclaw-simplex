import type {
  SimplexInviteCreateResult,
  SimplexInviteListResult,
  SimplexInviteMode,
  SimplexInviteRevokeResult,
  SimplexInviteServiceOptions,
} from "../types/invite.js";
import { resolveRuntimeAccount, withActiveSimplexUser } from "./simplex-runtime-ops.js";

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

export async function createSimplexInvite(
  params: SimplexInviteServiceOptions & { mode: SimplexInviteMode }
): Promise<SimplexInviteCreateResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const result = await withActiveSimplexUser({
    account,
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
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const { addressResponse, contactsResponse, addressLink } = await withActiveSimplexUser({
    account,
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
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const revoked = await withActiveSimplexUser({
    account,
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
