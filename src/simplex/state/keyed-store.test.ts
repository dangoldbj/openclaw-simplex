import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it, vi } from "vitest";
import { openSimplexKeyedStore } from "./keyed-store.js";

describe("simplex keyed store fallback", () => {
  it("enforces maxEntries by evicting the oldest fallback entry", async () => {
    const namespace = `test-max-${Date.now()}-${Math.random()}`;
    const store = openSimplexKeyedStore<string>({
      namespace,
      maxEntries: 2,
    });

    await store.register("a", "one");
    await store.register("b", "two");
    await store.register("c", "three");

    await expect(store.lookup("a")).resolves.toBeUndefined();
    await expect(store.lookup("b")).resolves.toBe("two");
    await expect(store.lookup("c")).resolves.toBe("three");
  });

  it("applies default ttl when a register call does not specify ttl", async () => {
    const namespace = `test-ttl-${Date.now()}-${Math.random()}`;
    const store = openSimplexKeyedStore<string>({
      namespace,
      maxEntries: 10,
      defaultTtlMs: 1,
    });

    await store.register("a", "one");
    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(store.lookup("a")).resolves.toBeUndefined();
  });

  it("falls back to memory when the host refuses to open a keyed store", async () => {
    const { runtime, warn } = hostRuntime(() => {
      throw new Error("state database unavailable");
    });
    const store = openSimplexKeyedStore<string>({
      runtime,
      namespace: uniqueNamespace("open-refused"),
      maxEntries: 10,
    });

    await store.register("a", "one");

    await expect(store.lookup("a")).resolves.toBe("one");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("simplex keyed store on a durable host store", () => {
  it("uses the host store when it works", async () => {
    const durable = fakeDurableStore();
    const { runtime, warn } = hostRuntime(() => durable);
    const store = openSimplexKeyedStore<string>({
      runtime,
      namespace: uniqueNamespace("durable"),
      maxEntries: 10,
      defaultTtlMs: 60_000,
    });

    await store.register("a", "one", { ttlMs: 5 });

    expect(durable.register).toHaveBeenCalledWith("a", "one", { ttlMs: 5 });
    await expect(store.lookup("a")).resolves.toBe("one");
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps a write that the host store rejected and warns once per namespace", async () => {
    const durable = fakeDurableStore();
    durable.register.mockRejectedValue(new Error("disk full"));
    const { runtime, warn } = hostRuntime(() => durable);
    const namespace = uniqueNamespace("write-failed");
    const store = openSimplexKeyedStore<string>({ runtime, namespace, maxEntries: 10 });

    await store.register("a", "one");
    await store.register("b", "two");

    await expect(store.lookup("a")).resolves.toBe("one");
    await expect(store.lookup("b")).resolves.toBe("two");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain(namespace);
    expect(warn.mock.calls[0]?.[0]).toContain("disk full");
  });

  it("answers from memory instead of throwing when a durable read fails", async () => {
    const durable = fakeDurableStore();
    durable.lookup.mockRejectedValue(new Error("database is locked"));
    durable.entries.mockRejectedValue(new Error("database is locked"));
    const { runtime } = hostRuntime(() => durable);
    const store = openSimplexKeyedStore<string>({
      runtime,
      namespace: uniqueNamespace("read-failed"),
      maxEntries: 10,
    });

    await expect(store.lookup("missing")).resolves.toBeUndefined();
    await expect(store.entries()).resolves.toEqual([]);
  });

  it("lists and deletes entries across the durable store and the memory fallback", async () => {
    const durable = fakeDurableStore();
    const { runtime } = hostRuntime(() => durable);
    const store = openSimplexKeyedStore<string>({
      runtime,
      namespace: uniqueNamespace("merged"),
      maxEntries: 10,
    });

    await store.register("durable", "one");
    durable.register.mockRejectedValueOnce(new Error("disk full"));
    await store.register("memory", "two");

    await expect(store.entries()).resolves.toEqual([
      { key: "durable", value: "one" },
      { key: "memory", value: "two" },
    ]);
    await expect(store.delete("memory")).resolves.toBe(true);
    await expect(store.delete("durable")).resolves.toBe(true);
    await expect(store.entries()).resolves.toEqual([]);
  });
});

function uniqueNamespace(label: string): string {
  return `test-${label}-${Date.now()}-${Math.random()}`;
}

function fakeDurableStore() {
  const entries = new Map<string, string>();
  return {
    register: vi.fn(async (key: string, value: string, _opts?: { ttlMs?: number }) => {
      entries.set(key, value);
    }),
    lookup: vi.fn(async (key: string) => entries.get(key)),
    delete: vi.fn(async (key: string) => entries.delete(key)),
    entries: vi.fn(async () => [...entries].map(([key, value]) => ({ key, value }))),
  };
}

function hostRuntime(openKeyedStore: () => unknown) {
  const warn = vi.fn();
  const runtime = {
    state: { openKeyedStore },
    logging: { getChildLogger: () => ({ info: vi.fn(), warn, error: vi.fn() }) },
  } as unknown as PluginRuntime;
  return { runtime, warn };
}
