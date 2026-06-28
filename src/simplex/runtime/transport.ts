import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexLogger } from "../../types/simplex.js";
import { SimplexClient } from "./client.js";

/**
 * Thrown when a native-mode operation needs the embedded core but no active
 * client is registered in this process. Opening a transient second core would
 * mean two connections to the same SQLite database (e.g. a CLI/status probe
 * running while the gateway holds the core), which can lock or corrupt it. The
 * embedded core is owned by the running gateway, so out-of-process callers must
 * not spin up their own.
 */
export class SimplexNativeCoreUnavailableError extends Error {
  readonly accountId: string;
  constructor(account: ResolvedSimplexAccount) {
    super(
      `SimpleX native core for account "${account.accountId}" is not running in this process. ` +
        "The embedded core is owned by the gateway; opening a second connection to " +
        `${account.db?.filePrefix ?? "the database"} could lock or corrupt it. ` +
        "Run this while the channel is active in the gateway process."
    );
    this.name = "SimplexNativeCoreUnavailableError";
    this.accountId = account.accountId;
  }
}

type SharedSimplexClientKey = `${string}|${number}|${number}`;

const activeSimplexClients = new Map<string, SimplexClient>();
const activeSimplexClientsByKey = new Map<SharedSimplexClientKey, SimplexClient>();

function sharedClientKey(account: ResolvedSimplexAccount): SharedSimplexClientKey {
  if (account.mode === "native") {
    // One embedded core per database; two native accounts with distinct DBs
    // must not share a client (and must never open the same SQLite twice).
    return `native|${account.db?.filePrefix ?? account.accountId}|0` as SharedSimplexClientKey;
  }
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
  // Native mode: never open a transient second core against the same database.
  if (params.account.mode === "native") {
    throw new SimplexNativeCoreUnavailableError(params.account);
  }
  const client = new SimplexClient({ account: params.account, logger: params.logger });
  try {
    await client.connect();
    return await params.run(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}
