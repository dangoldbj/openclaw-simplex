import { getSimplexRuntime } from "../channel/runtime.js";
import { openSimplexKeyedStore } from "./simplex-state-store.js";

const SEEN_EVENT_NAMESPACE = "simplex-seen-events";
const SEEN_EVENT_MAX_ENTRIES = 10_000;
const SEEN_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function markSimplexEventSeen(params: {
  accountId: string;
  chatId: number | string;
  messageId: number | string;
}): Promise<boolean> {
  const key = `${params.accountId}:${params.chatId}:${params.messageId}`;
  const store = openSimplexKeyedStore<boolean>({
    runtime: getSimplexRuntime(),
    namespace: SEEN_EVENT_NAMESPACE,
    maxEntries: SEEN_EVENT_MAX_ENTRIES,
    defaultTtlMs: SEEN_EVENT_TTL_MS,
  });
  const seen = await store.lookup(key);
  if (seen) {
    return false;
  }
  await store.register(key, true, { ttlMs: SEEN_EVENT_TTL_MS });
  return true;
}
