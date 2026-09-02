import { describeError } from "../../errors.js";
import type { SimplexAccountScope } from "../../types/config.js";
import type { SimplexDeleteMode } from "../../types/simplex.js";
import { resolveRuntimeAccount } from "../runtime/account.js";
import { parseSimplexNumericId } from "../runtime/api.js";
import { withSimplexClient } from "../runtime/transport.js";

type RuntimeOperationResult = {
  accountId: string;
  ok: boolean;
  unsupported?: boolean;
  result?: unknown;
  error?: string;
};

function unsupportedResult(accountId: string, err: unknown): RuntimeOperationResult {
  const message = describeError(err);
  return {
    accountId,
    ok: false,
    unsupported: true,
    error: message,
  };
}

function readRequiredNumericId(value: unknown, label: string): number {
  const parsed =
    typeof value === "number" || typeof value === "string" ? parseSimplexNumericId(value) : null;
  if (parsed === null || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export async function listSimplexRuntimeUsers(
  params: SimplexAccountScope
): Promise<{ accountId: string; users: unknown[] }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const users = await withSimplexClient({
    account,
    run: (client) => client.listUsers(),
  });
  return { accountId: account.accountId, users };
}

export async function showSimplexRuntimeActiveUser(
  params: SimplexAccountScope
): Promise<{ accountId: string; activeUser: unknown }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const activeUser = await withSimplexClient({
    account,
    run: (client) => client.getActiveUser(),
  });
  return { accountId: account.accountId, activeUser };
}

export async function showSimplexContactVerification(
  params: SimplexAccountScope & {
    contactId: unknown;
  }
): Promise<RuntimeOperationResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const contactId = readRequiredNumericId(params.contactId, "contactId");
  try {
    const result = await withSimplexClient({
      account,
      run: (client) => client.showContactVerification(contactId),
    });
    return { accountId: account.accountId, ok: true, result };
  } catch (err) {
    return unsupportedResult(account.accountId, err);
  }
}

export async function checkSimplexContactVerification(
  params: SimplexAccountScope & {
    contactId: unknown;
    code?: string | null;
  }
): Promise<RuntimeOperationResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const contactId = readRequiredNumericId(params.contactId, "contactId");
  try {
    const result = await withSimplexClient({
      account,
      run: (client) => client.checkContactVerification({ contactId, code: params.code }),
    });
    return { accountId: account.accountId, ok: true, result };
  } catch (err) {
    return unsupportedResult(account.accountId, err);
  }
}

export async function blockSimplexGroupMember(
  params: SimplexAccountScope & {
    groupId: unknown;
    memberId: unknown;
  }
): Promise<RuntimeOperationResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readRequiredNumericId(params.groupId, "groupId");
  const memberId = readRequiredNumericId(params.memberId, "memberId");
  try {
    const result = await withSimplexClient({
      account,
      run: (client) => client.blockGroupMember({ groupId, memberId }),
    });
    return { accountId: account.accountId, ok: true, result };
  } catch (err) {
    return unsupportedResult(account.accountId, err);
  }
}

export async function deleteSimplexGroupMemberMessages(
  params: SimplexAccountScope & {
    groupId: unknown;
    memberId: unknown;
    deleteMode?: SimplexDeleteMode;
  }
): Promise<RuntimeOperationResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readRequiredNumericId(params.groupId, "groupId");
  const memberId = readRequiredNumericId(params.memberId, "memberId");
  try {
    const result = await withSimplexClient({
      account,
      run: (client) =>
        client.deleteGroupMemberMessages({ groupId, memberId, deleteMode: params.deleteMode }),
    });
    return { accountId: account.accountId, ok: true, result };
  } catch (err) {
    return unsupportedResult(account.accountId, err);
  }
}

export async function receiveSimplexFile(
  params: SimplexAccountScope & {
    fileId: unknown;
  }
): Promise<RuntimeOperationResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const fileId = readRequiredNumericId(params.fileId, "fileId");
  const result = await withSimplexClient({
    account,
    run: (client) => client.receiveFile(fileId),
  });
  return { accountId: account.accountId, ok: true, result };
}

export async function cancelSimplexFile(
  params: SimplexAccountScope & {
    fileId: unknown;
  }
): Promise<RuntimeOperationResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const fileId = readRequiredNumericId(params.fileId, "fileId");
  const result = await withSimplexClient({
    account,
    run: (client) => client.cancelFile(fileId),
  });
  return { accountId: account.accountId, ok: true, result };
}
