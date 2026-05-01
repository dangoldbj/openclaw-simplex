import type { ResolvedSimplexAccount } from "../types/config.js";
import type { SimplexChatApi, SimplexLogger } from "../types/simplex.js";
import { SimplexNodeClient } from "./simplex-node-client.js";

type SharedSimplexNodeClientKey = `${string}|${string}|${number}`;

export const activeSimplexNodeClients = new Map<string, SimplexNodeClient>();
const activeSimplexNodeClientsByKey = new Map<SharedSimplexNodeClientKey, SimplexNodeClient>();
const sharedSimplexNodeClients = new Map<SharedSimplexNodeClientKey, SimplexNodeClient>();

function sharedClientKey(account: ResolvedSimplexAccount): SharedSimplexNodeClientKey {
  const timeoutMs = account.config.connectTimeoutMs ?? 15_000;
  return `${account.mode}|${account.dbFilePrefix ?? "unconfigured"}|${timeoutMs}`;
}

export async function registerActiveSimplexNodeClient(
  account: ResolvedSimplexAccount,
  client: SimplexNodeClient
): Promise<void> {
  const key = sharedClientKey(account);
  const shared = sharedSimplexNodeClients.get(key);
  if (shared && shared !== client) {
    sharedSimplexNodeClients.delete(key);
    await shared.close().catch(() => undefined);
  }
  activeSimplexNodeClients.set(account.accountId, client);
  activeSimplexNodeClientsByKey.set(key, client);
}

export function unregisterActiveSimplexNodeClient(
  account: ResolvedSimplexAccount,
  client: SimplexNodeClient
): void {
  if (activeSimplexNodeClients.get(account.accountId) === client) {
    activeSimplexNodeClients.delete(account.accountId);
  }
  const key = sharedClientKey(account);
  if (activeSimplexNodeClientsByKey.get(key) === client) {
    activeSimplexNodeClientsByKey.delete(key);
  }
}

function getSharedSimplexNodeClient(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
}): SimplexNodeClient {
  const key = sharedClientKey(params.account);
  const existing = sharedSimplexNodeClients.get(key);
  if (existing) {
    return existing;
  }
  const created = new SimplexNodeClient({ account: params.account, logger: params.logger });
  sharedSimplexNodeClients.set(key, created);
  return created;
}

export async function withSimplexApi<T>(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  run: (api: SimplexChatApi) => Promise<T>;
}): Promise<T> {
  const activeClient = activeSimplexNodeClients.get(params.account.accountId);
  if (activeClient) {
    return await activeClient.withApi(params.run);
  }
  const sharedActiveClient = activeSimplexNodeClientsByKey.get(sharedClientKey(params.account));
  if (sharedActiveClient) {
    return await sharedActiveClient.withApi(params.run);
  }
  const client = getSharedSimplexNodeClient(params);
  return await client.withApi(params.run);
}
