import { describe, expect, it } from "vitest";
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
});
