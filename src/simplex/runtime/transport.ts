import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexLogger } from "../../types/simplex.js";
import { SimplexClient } from "./client.js";

type SharedSimplexClientKey = `${string}|${number}|${number}`;

const activeSimplexClients = new Map<string, SimplexClient>();
const activeSimplexClientsByKey = new Map<SharedSimplexClientKey, SimplexClient>();

function sharedClientKey(account: ResolvedSimplexAccount): SharedSimplexClientKey {
  const timeoutMs = account.config.connection?.connectTimeoutMs ?? 15_000;
  const commandTimeoutMs = account.config.connection?.commandTimeoutMs ?? 20_000;
  return `${account.wsUrl}|${timeoutMs}|${commandTimeoutMs}`;
}

export async function registerActiveSimplexClient(
  account: ResolvedSimplexAccount,
  client: SimplexClient
): Promise<void> {
  const key = sharedClientKey(account);
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

/**
 * Closes every registered client. The monitor closes its own client on abort,
 * but a plugin `disable` or `reset` tears the plugin down without aborting the
 * gateway account, which would otherwise leave the WebSocket open.
 */
export async function closeAllActiveSimplexClients(): Promise<number> {
  const clients = new Set([
    ...activeSimplexClients.values(),
    ...activeSimplexClientsByKey.values(),
  ]);
  activeSimplexClients.clear();
  activeSimplexClientsByKey.clear();
  await Promise.all([...clients].map((client) => client.close().catch(() => undefined)));
  return clients.size;
}

export function getActiveSimplexClient(accountId: string): SimplexClient | undefined {
  return activeSimplexClients.get(accountId);
}

export function hasActiveSimplexClient(accountId: string): boolean {
  return activeSimplexClients.has(accountId);
}

export async function withSimplexClient<T>(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  run: (client: SimplexClient) => Promise<T>;
}): Promise<T> {
  const activeClient = activeSimplexClients.get(params.account.accountId);
  if (activeClient) {
    return await params.run(activeClient);
  }
  const sharedActiveClient = activeSimplexClientsByKey.get(sharedClientKey(params.account));
  if (sharedActiveClient) {
    return await params.run(sharedActiveClient);
  }
  const client = new SimplexClient({ account: params.account, logger: params.logger });
  try {
    await client.connect();
    return await params.run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}
