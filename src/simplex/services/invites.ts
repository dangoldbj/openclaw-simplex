import { describeError } from "../../errors.js";
import type {
  SimplexInviteCreateResult,
  SimplexInviteListResult,
  SimplexInviteMode,
  SimplexInviteRevokeResult,
  SimplexInviteServiceOptions,
} from "../../types/invite.js";
import { resolveRuntimeAccount, withActiveSimplexUser } from "../runtime/account.js";
import { extractSimplexLinks, extractSimplexPendingHints } from "../runtime/links.js";

export function resolveInviteMode(value: unknown): SimplexInviteMode | null {
  if (value === "connect" || value === "address") {
    return value;
  }
  return null;
}

export async function createSimplexInvite(
  params: SimplexInviteServiceOptions & { mode: SimplexInviteMode }
): Promise<SimplexInviteCreateResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const result = await withActiveSimplexUser({
    account,
    logger: params.logger,
    run: async (_userId, client) => {
      if (params.mode === "connect") {
        return await client.createInviteLink();
      }
      return await client.createAddress();
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
    run: async (userId, client) => {
      const [address, contacts] = await Promise.all([
        client.getAddress().catch((err) => ({
          link: null,
          response: {
            type: "addressLookupFailed",
            error: describeError(err),
          },
        })),
        client.listContacts(userId),
      ]);
      return {
        addressResponse: address.response,
        contactsResponse: contacts,
        addressLink: address.link,
      };
    },
  });
  return {
    accountId: account.accountId,
    addressLink,
    links: [
      ...new Set([
        ...(addressLink ? [addressLink] : []),
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
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const revoked = await withActiveSimplexUser({
    account,
    logger: params.logger,
    run: async (_userId, client) => {
      const current = await client.getAddress().catch(() => ({ link: null }));
      if (!current.link) {
        return false;
      }
      await client.deleteAddress();
      return true;
    },
  });
  return {
    accountId: account.accountId,
    revoked,
  };
}
