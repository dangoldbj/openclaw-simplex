import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";
import { getSimplexRuntime } from "../../channel/runtime.js";
import { openSimplexKeyedStore } from "./keyed-store.js";

const PAIRING_STORE_NAMESPACE = "simplex-pairing-requests";
const PAIRING_STORE_MAX_ENTRIES = 200;
/**
 * Outlives the pairing code itself on purpose: an expired entry still tells the
 * operator that someone tried to reach the agent and was never approved.
 */
const PAIRING_STORE_TTL_MS = 24 * 60 * 60 * 1000;

export type StoredSimplexPairingRequest = {
  accountId: string;
  senderId: string;
  code: string;
  displayName?: string;
  storedAt: number;
};

function pairingKey(accountId: string, senderId: string): string {
  return `${accountId}:${senderId}`;
}

function pairingStore(runtime?: PluginRuntime | null) {
  return openSimplexKeyedStore<StoredSimplexPairingRequest>({
    runtime,
    namespace: PAIRING_STORE_NAMESPACE,
    maxEntries: PAIRING_STORE_MAX_ENTRIES,
    defaultTtlMs: PAIRING_STORE_TTL_MS,
  });
}

export async function recordSimplexPairingRequest(params: {
  accountId: string;
  senderId: string;
  code: string;
  displayName?: string;
}): Promise<void> {
  const stored: StoredSimplexPairingRequest = {
    accountId: params.accountId,
    senderId: params.senderId,
    code: params.code,
    displayName: params.displayName,
    storedAt: Date.now(),
  };
  await pairingStore(getSimplexRuntime()).register(
    pairingKey(params.accountId, params.senderId),
    stored,
    { ttlMs: PAIRING_STORE_TTL_MS }
  );
}

export async function listStoredSimplexPairingRequests(params: {
  accountId: string;
}): Promise<StoredSimplexPairingRequest[]> {
  const entries = await pairingStore(getSimplexRuntime()).entries();
  return entries
    .map((entry) => entry.value)
    .filter((request) => request.accountId === params.accountId)
    .toSorted((a, b) => b.storedAt - a.storedAt);
}

export async function deleteStoredSimplexPairingRequest(params: {
  accountId: string;
  senderId: string;
}): Promise<boolean> {
  return await pairingStore(getSimplexRuntime()).delete(
    pairingKey(params.accountId, params.senderId)
  );
}

export async function clearStoredSimplexPairingRequests(params: {
  accountId: string;
}): Promise<number> {
  const stored = await listStoredSimplexPairingRequests(params);
  let removed = 0;
  for (const request of stored) {
    if (
      await deleteStoredSimplexPairingRequest({
        accountId: params.accountId,
        senderId: request.senderId,
      })
    ) {
      removed += 1;
    }
  }
  return removed;
}
