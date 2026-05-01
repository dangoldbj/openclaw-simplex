import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatApi, SimplexLogger } from "../../types/simplex.js";
import { SimplexClient } from "./client.js";

type SharedSimplexClientKey = `${string}|${string}|${number}`;

const activeSimplexClients = new Map<string, SimplexClient>();
const activeSimplexClientsByKey = new Map<SharedSimplexClientKey, SimplexClient>();
const sharedSimplexClients = new Map<SharedSimplexClientKey, SimplexClient>();

function sharedClientKey(account: ResolvedSimplexAccount): SharedSimplexClientKey {
  const timeoutMs = account.config.connectTimeoutMs ?? 15_000;
  return `${account.mode}|${account.dbFilePrefix ?? "unconfigured"}|${timeoutMs}`;
}

export async function registerActiveSimplexClient(
  account: ResolvedSimplexAccount,
  client: SimplexClient
): Promise<void> {
  const key = sharedClientKey(account);
  const shared = sharedSimplexClients.get(key);
  if (shared && shared !== client) {
    sharedSimplexClients.delete(key);
    await shared.close().catch(() => undefined);
  }
  activeSimplexClients.set(account.accountId, client);
  activeSimplexClientsByKey.set(key, client);
}

export function unregisterActiveSimplexClient(
  account: ResolvedSimplexAccount,
  client: SimplexClient
): void {
  if (activeSimplexClients.get(account.accountId) === client) {
    activeSimplexClients.delete(account.accountId);
  }
  const key = sharedClientKey(account);
  if (activeSimplexClientsByKey.get(key) === client) {
    activeSimplexClientsByKey.delete(key);
  }
}

export function getActiveSimplexClient(accountId: string): SimplexClient | undefined {
  return activeSimplexClients.get(accountId);
}

export function hasActiveSimplexClient(accountId: string): boolean {
  return activeSimplexClients.has(accountId);
}

function getSharedSimplexClient(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
}): SimplexClient {
  const key = sharedClientKey(params.account);
  const existing = sharedSimplexClients.get(key);
  if (existing) {
    return existing;
  }
  const created = new SimplexClient({ account: params.account, logger: params.logger });
  sharedSimplexClients.set(key, created);
  return created;
}

export async function withSimplexApi<T>(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  run: (api: SimplexChatApi) => Promise<T>;
}): Promise<T> {
  const activeClient = activeSimplexClients.get(params.account.accountId);
  if (activeClient) {
    return await activeClient.withApi(params.run);
  }
  const sharedActiveClient = activeSimplexClientsByKey.get(sharedClientKey(params.account));
  if (sharedActiveClient) {
    return await sharedActiveClient.withApi(params.run);
  }
  const client = getSharedSimplexClient(params);
  return await client.withApi(params.run);
}
