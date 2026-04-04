import type { ResolvedSimplexAccount } from "../config/types.js";
import { SimplexWsClient } from "../simplex/simplex-ws-client.js";

export type SimplexClientRegistry = Map<string, SimplexWsClient>;

export async function withSimplexRegistryClient<T>(
  registry: SimplexClientRegistry,
  account: ResolvedSimplexAccount,
  fn: (client: SimplexWsClient) => Promise<T>
): Promise<T> {
  const existing = registry.get(account.accountId);
  if (existing) {
    await existing.connect();
    return await fn(existing);
  }
  const client = new SimplexWsClient({
    url: account.wsUrl,
    connectTimeoutMs: account.config.connection?.connectTimeoutMs,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}
