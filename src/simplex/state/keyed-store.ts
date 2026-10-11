import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_PLUGIN_ID } from "../../constants.js";
import { describeError } from "../../errors.js";

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

const reportedFailures = new Set<string>();

function reportDurableFailure(params: {
  runtime?: PluginRuntime | null;
  namespace: string;
  error: unknown;
}): void {
  if (reportedFailures.has(params.namespace)) {
    return;
  }
  reportedFailures.add(params.namespace);
  params.runtime?.logging
    ?.getChildLogger({ plugin: SIMPLEX_PLUGIN_ID })
    .warn(
      `SimpleX state "${params.namespace}" is falling back to memory: ${describeError(params.error)}`
    );
}

/**
 * Durable state is best effort. Inbound handling, pairing and contact requests
 * must keep working when the host store fails, so every failed durable call is
 * served from memory instead. Writes that fell back are still found by lookups,
 * because a durable miss is checked against memory before reporting absence.
 */
function withMemoryFallback<T>(
  durable: SimplexKeyedStore<T>,
  memory: SimplexKeyedStore<T>,
  onError: (error: unknown) => void
): SimplexKeyedStore<T> {
  async function attempt<R>(
    run: () => Promise<R>
  ): Promise<{ ok: true; value: R } | { ok: false }> {
    try {
      return { ok: true, value: await run() };
    } catch (error) {
      onError(error);
      return { ok: false };
    }
  }
  return {
    async register(key, value, opts) {
      if (!(await attempt(() => durable.register(key, value, opts))).ok) {
        await memory.register(key, value, opts);
      }
    },
    async lookup(key) {
      const result = await attempt(() => durable.lookup(key));
      if (result.ok && result.value !== undefined) {
        return result.value;
      }
      return memory.lookup(key);
    },
    async delete(key) {
      const result = await attempt(() => durable.delete(key));
      const removedFromMemory = await memory.delete(key);
      return (result.ok && result.value) || removedFromMemory;
    },
    async entries() {
      const result = await attempt(() => durable.entries());
      const merged = new Map((result.ok ? result.value : []).map((entry) => [entry.key, entry]));
      for (const entry of await memory.entries()) {
        merged.set(entry.key, entry);
      }
      return [...merged.values()];
    },
  };
}

export function openSimplexKeyedStore<T>(params: {
  runtime?: PluginRuntime | null;
  namespace: string;
  maxEntries: number;
  defaultTtlMs?: number;
}): SimplexKeyedStore<T> {
  const memory = memoryStore<T>(params);
  const state = params.runtime?.state;
  if (!state?.openKeyedStore) {
    return memory;
  }
  const onError = (error: unknown) =>
    reportDurableFailure({ runtime: params.runtime, namespace: params.namespace, error });
  try {
    const durable = state.openKeyedStore<T>({
      namespace: params.namespace,
      maxEntries: params.maxEntries,
      defaultTtlMs: params.defaultTtlMs,
    });
    return withMemoryFallback(durable, memory, onError);
  } catch (error) {
    onError(error);
    return memory;
  }
}
