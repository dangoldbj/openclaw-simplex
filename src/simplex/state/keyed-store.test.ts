import type { PluginRuntime } from "openclaw/plugin-sdk/channel-core";
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

  it("falls back to memory when the host exposes but rejects keyed stores", async () => {
    const namespace = `test-rejected-host-store-${Date.now()}-${Math.random()}`;
    const runtime: Partial<PluginRuntime> = {
      state: {
        resolveStateDir: () => "/tmp/openclaw-simplex-test",
        openKeyedStore() {
          throw new Error("openKeyedStore is only available for bundled plugins in this release");
        },
        openSyncKeyedStore() {
          throw new Error(
            "openSyncKeyedStore is only available for bundled plugins in this release"
          );
        },
        openChannelIngressQueue() {
          throw new Error(
            "openChannelIngressQueue is only available for bundled plugins in this release"
          );
        },
        openChannelIngressDrain() {
          throw new Error(
            "openChannelIngressDrain is only available for bundled plugins in this release"
          );
        },
        openBlobStore() {
          throw new Error("openBlobStore is only available for bundled plugins in this release");
        },
      },
    };
    const store = openSimplexKeyedStore<string>({
      runtime: runtime as PluginRuntime,
      namespace,
      maxEntries: 10,
    });

    await store.register("a", "one");

    await expect(store.lookup("a")).resolves.toBe("one");
  });
});
