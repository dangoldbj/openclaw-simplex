import type { SimplexAccountScope } from "../../types/config.js";
import { resolveRuntimeAccount, withActiveSimplexUser } from "../runtime/account.js";
import {
  deleteStoredSimplexContactRequest,
  listStoredSimplexContactRequests,
  type StoredSimplexContactRequest,
} from "../state/contact-requests.js";

export async function listSimplexContactRequests(
  params: SimplexAccountScope
): Promise<{ accountId: string; requests: StoredSimplexContactRequest[] }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  return {
    accountId: account.accountId,
    requests: await listStoredSimplexContactRequests({ accountId: account.accountId }),
  };
}

export async function acceptSimplexContactRequest(
  params: SimplexAccountScope & {
    contactRequestId: number;
  }
): Promise<{
  accountId: string;
  contactRequestId: number;
  accepted: boolean;
  contact: unknown;
}> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const contact = await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.acceptContactRequest(params.contactRequestId),
  });
  await deleteStoredSimplexContactRequest({
    accountId: account.accountId,
    contactRequestId: params.contactRequestId,
  });
  return {
    accountId: account.accountId,
    contactRequestId: params.contactRequestId,
    accepted: true,
    contact,
  };
}

export async function rejectSimplexContactRequest(
  params: SimplexAccountScope & {
    contactRequestId: number;
  }
): Promise<{ accountId: string; contactRequestId: number; rejected: boolean }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.rejectContactRequest(params.contactRequestId),
  });
  await deleteStoredSimplexContactRequest({
    accountId: account.accountId,
    contactRequestId: params.contactRequestId,
  });
  return {
    accountId: account.accountId,
    contactRequestId: params.contactRequestId,
    rejected: true,
  };
}
