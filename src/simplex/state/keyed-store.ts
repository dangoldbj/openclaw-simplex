import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";

const memoryStores = new Map<string, Map<string, { value: unknown; expiresAt?: number }>>();

function memoryStore<T>(namespace: string) {
  const entries =
    memoryStores.get(namespace) ?? new Map<string, { value: unknown; expiresAt?: number }>();
  memoryStores.set(namespace, entries);
  function sweep(): void {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  }
  return {
    async register(key: string, value: T, opts?: { ttlMs?: number }) {
      entries.set(key, {
        value,
        expiresAt: opts?.ttlMs ? Date.now() + opts.ttlMs : undefined,
      });
    },
    async lookup(key: string): Promise<T | undefined> {
      sweep();
      return entries.get(key)?.value as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return entries.delete(key);
    },
    async entries(): Promise<
      Array<{ key: string; value: T; createdAt: number; expiresAt?: number }>
    > {
      sweep();
      return [...entries].map(([key, entry]) => ({
        key,
        value: entry.value as T,
        createdAt: 0,
        expiresAt: entry.expiresAt,
      }));
    },
  };
}

export function openSimplexKeyedStore<T>(params: {
  runtime?: PluginRuntime | null;
  namespace: string;
  maxEntries: number;
  defaultTtlMs?: number;
}) {
  const state = params.runtime?.state;
  if (state?.openKeyedStore) {
    return state.openKeyedStore<T>({
      namespace: params.namespace,
      maxEntries: params.maxEntries,
      defaultTtlMs: params.defaultTtlMs,
    });
  }
  return memoryStore<T>(params.namespace);
}
