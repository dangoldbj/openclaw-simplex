import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveRuntimeAccount, withActiveSimplexUser } from "../runtime/account.js";
import {
  deleteStoredSimplexContactRequest,
  listStoredSimplexContactRequests,
  type StoredSimplexContactRequest,
} from "../state/contact-requests.js";

export async function listSimplexContactRequests(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<{ accountId: string; requests: StoredSimplexContactRequest[] }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  return {
    accountId: account.accountId,
    requests: await listStoredSimplexContactRequests({ accountId: account.accountId }),
  };
}

export async function acceptSimplexContactRequest(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  contactRequestId: number;
}): Promise<{
  accountId: string;
  contactRequestId: number;
  accepted: boolean;
  contact: unknown;
}> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const contact = await withActiveSimplexUser({
    account,
    run: (_userId, api) => api.apiAcceptContactRequest(params.contactRequestId),
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

export async function rejectSimplexContactRequest(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  contactRequestId: number;
}): Promise<{ accountId: string; contactRequestId: number; rejected: boolean }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  await withActiveSimplexUser({
    account,
    run: (_userId, api) => api.apiRejectContactRequest(params.contactRequestId),
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
