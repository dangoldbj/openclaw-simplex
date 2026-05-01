import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";
import { getSimplexRuntime } from "../../channel/runtime.js";
import { openSimplexKeyedStore } from "./keyed-store.js";

const REQUEST_STORE_NAMESPACE = "simplex-contact-requests";
const REQUEST_STORE_MAX_ENTRIES = 500;
const REQUEST_STORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type StoredSimplexContactRequest = {
  accountId: string;
  contactRequestId: number;
  displayName?: string;
  profile?: unknown;
  createdAt?: string;
  updatedAt?: string;
  xContactId?: string;
  storedAt: number;
};

function requestKey(accountId: string, contactRequestId: number): string {
  return `${accountId}:${contactRequestId}`;
}

function requestStore(runtime?: PluginRuntime | null) {
  return openSimplexKeyedStore<StoredSimplexContactRequest>({
    runtime,
    namespace: REQUEST_STORE_NAMESPACE,
    maxEntries: REQUEST_STORE_MAX_ENTRIES,
    defaultTtlMs: REQUEST_STORE_TTL_MS,
  });
}

export async function recordSimplexContactRequest(params: {
  accountId: string;
  contactRequest: unknown;
}): Promise<void> {
  const request = params.contactRequest as Record<string, unknown>;
  const contactRequestId = request.contactRequestId;
  if (typeof contactRequestId !== "number") {
    return;
  }
  const stored: StoredSimplexContactRequest = {
    accountId: params.accountId,
    contactRequestId,
    displayName:
      typeof request.localDisplayName === "string" ? request.localDisplayName : undefined,
    profile: request.profile,
    createdAt: typeof request.createdAt === "string" ? request.createdAt : undefined,
    updatedAt: typeof request.updatedAt === "string" ? request.updatedAt : undefined,
    xContactId: typeof request.xContactId === "string" ? request.xContactId : undefined,
    storedAt: Date.now(),
  };
  await requestStore(getSimplexRuntime()).register(
    requestKey(params.accountId, contactRequestId),
    stored,
    { ttlMs: REQUEST_STORE_TTL_MS }
  );
}

export async function listStoredSimplexContactRequests(params: {
  accountId: string;
}): Promise<StoredSimplexContactRequest[]> {
  const entries = await requestStore(getSimplexRuntime()).entries();
  return entries
    .map((entry) => entry.value)
    .filter((request) => request.accountId === params.accountId)
    .toSorted((a, b) => b.storedAt - a.storedAt);
}

export async function deleteStoredSimplexContactRequest(params: {
  accountId: string;
  contactRequestId: number;
}): Promise<boolean> {
  return await requestStore(getSimplexRuntime()).delete(
    requestKey(params.accountId, params.contactRequestId)
  );
}
