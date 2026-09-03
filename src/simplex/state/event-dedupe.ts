import { getSimplexRuntime } from "../../channel/runtime.js";
import { openSimplexKeyedStore } from "./keyed-store.js";

const SEEN_EVENT_NAMESPACE = "simplex-seen-events";
const SEEN_EVENT_MAX_ENTRIES = 10_000;
const SEEN_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SimplexEventKey = {
  accountId: string;
  chatId: number | string;
  messageId: number | string;
};

function seenKey(params: SimplexEventKey): string {
  return `${params.accountId}:${params.chatId}:${params.messageId}`;
}

function seenStore() {
  return openSimplexKeyedStore<boolean>({
    runtime: getSimplexRuntime(),
    namespace: SEEN_EVENT_NAMESPACE,
    maxEntries: SEEN_EVENT_MAX_ENTRIES,
    defaultTtlMs: SEEN_EVENT_TTL_MS,
  });
}

export async function hasSimplexEventBeenSeen(params: SimplexEventKey | null): Promise<boolean> {
  if (!params) {
    return false;
  }
  return (await seenStore().lookup(seenKey(params))) === true;
}

/**
 * Records an inbound event as handled.
 *
 * Callers must mark only after the event has been dispatched or otherwise
 * handed off. Marking before dispatch makes a crash in between drop the message
 * permanently, because the replay after reconnect then sees it as already
 * handled. Checking first and marking afterwards is deliberately at-least-once:
 * a crash mid-dispatch replays the event rather than losing it.
 */
export async function markSimplexEventSeen(params: SimplexEventKey | null): Promise<void> {
  if (!params) {
    return;
  }
  await seenStore().register(seenKey(params), true, { ttlMs: SEEN_EVENT_TTL_MS });
}

/**
 * Drops every dedupe marker owned by an account.
 *
 * Matched on the key prefix because the stored value is only `true`; the key is
 * built as `accountId:chatId:messageId`, so an account id containing a colon
 * would over-match. Config account ids are plain identifiers, and over-matching
 * here only replays messages rather than losing them.
 */
export async function clearSimplexEventDedupeForAccount(accountId: string): Promise<number> {
  const store = seenStore();
  const prefix = `${accountId}:`;
  let removed = 0;
  for (const entry of await store.entries()) {
    if (entry.key.startsWith(prefix) && (await store.delete(entry.key))) {
      removed += 1;
    }
  }
  return removed;
}
