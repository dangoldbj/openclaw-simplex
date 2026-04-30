import type { ResolvedSimplexAccount } from "../config/types.js";
import { SimplexWsClient } from "../simplex/simplex-ws-client.js";
import { assertSimplexWsEndpointAllowed } from "./simplex-transport-security.js";

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
  assertSimplexWsEndpointAllowed({
    wsUrl: account.wsUrl,
    allowUnsafeRemoteWs: account.config.connection?.allowUnsafeRemoteWs === true,
  });
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
