import { SimplexWsClient, type SimplexWsResponse } from "./simplex-ws-client.js";
import type { ResolvedSimplexAccount } from "../config/types.js";

export type SimplexLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

type SharedSimplexClientKey = `${string}|${number}`;

const sharedSimplexClients = new Map<SharedSimplexClientKey, SimplexWsClient>();

function getSharedSimplexClient(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
}): SimplexWsClient {
  const timeoutMs = params.account.config.connection?.connectTimeoutMs ?? 15_000;
  const key: SharedSimplexClientKey = `${params.account.wsUrl}|${timeoutMs}`;
  const existing = sharedSimplexClients.get(key);
  if (existing) {
    return existing;
  }
  const created = new SimplexWsClient({
    url: params.account.wsUrl,
    connectTimeoutMs: timeoutMs,
    logger: params.logger,
  });
  sharedSimplexClients.set(key, created);
  return created;
}

export async function sendSimplexCommand(params: {
  account: ResolvedSimplexAccount;
  command: string;
  logger?: SimplexLogger;
}): Promise<SimplexWsResponse> {
  const client = getSharedSimplexClient(params);
  await client.connect();
  return await client.sendCommand(params.command);
}

export async function sendSimplexCommandWithRetry(params: {
  account: ResolvedSimplexAccount;
  command: string;
  logger?: SimplexLogger;
  startChannel?: () => Promise<void>;
  isRunning?: () => boolean;
}): Promise<SimplexWsResponse> {
  const maxAttempts = 6;
  let started = false;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await sendSimplexCommand(params);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const running = params.isRunning?.() ?? false;
      if (!started && !running && params.startChannel) {
        started = true;
        await params.startChannel();
      }
      await new Promise((resolve) => setTimeout(resolve, 500 + attempt * 400));
    }
  }

  throw lastError ?? new Error("SimpleX command failed");
}
