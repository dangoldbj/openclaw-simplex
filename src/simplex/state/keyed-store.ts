import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";

export type SimplexKeyedStore<T> = {
  register(key: string, value: T, opts?: { ttlMs?: number }): Promise<void>;
  lookup(key: string): Promise<T | undefined>;
  delete(key: string): Promise<boolean>;
  entries(): Promise<Array<{ key: string; value: T }>>;
};

const memoryStores = new Map<string, Map<string, { value: unknown; expiresAt?: number }>>();

function memoryStore<T>(params: {
  namespace: string;
  maxEntries: number;
  defaultTtlMs?: number;
}): SimplexKeyedStore<T> {
  const entries =
    memoryStores.get(params.namespace) ?? new Map<string, { value: unknown; expiresAt?: number }>();
  memoryStores.set(params.namespace, entries);
  function sweep(): void {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        entries.delete(key);
      }
    }
  }
  function enforceMaxEntries(): void {
    while (entries.size > params.maxEntries) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      entries.delete(oldestKey);
    }
  }
  return {
    async register(key: string, value: T, opts?: { ttlMs?: number }) {
      sweep();
      const ttlMs = opts?.ttlMs ?? params.defaultTtlMs;
      entries.delete(key);
      entries.set(key, {
        value,
        expiresAt: ttlMs ? Date.now() + ttlMs : undefined,
      });
      enforceMaxEntries();
    },
    async lookup(key: string): Promise<T | undefined> {
      sweep();
      return entries.get(key)?.value as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return entries.delete(key);
    },
    async entries(): Promise<Array<{ key: string; value: T }>> {
      sweep();
      return [...entries].map(([key, entry]) => ({ key, value: entry.value as T }));
    },
  };
}

export function openSimplexKeyedStore<T>(params: {
  runtime?: PluginRuntime | null;
  namespace: string;
  maxEntries: number;
  defaultTtlMs?: number;
}): SimplexKeyedStore<T> {
  const state = params.runtime?.state;
  if (state?.openKeyedStore) {
    try {
      return state.openKeyedStore<T>({
        namespace: params.namespace,
        maxEntries: params.maxEntries,
        defaultTtlMs: params.defaultTtlMs,
      });
    } catch {
      return memoryStore<T>(params);
    }
  }
  return memoryStore<T>(params);
}
