import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "./timeout.js";

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the promise's value when it settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 1_000)).resolves.toBe("ok");
  });

  it("passes the promise's own rejection through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1_000)).rejects.toThrow("boom");
  });

  it("rejects with the given message once the timeout elapses", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 50, { message: "too slow" });
    const assertion = expect(pending).rejects.toThrow("too slow");
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it('defaults the message to "timeout"', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise(() => {}), 50);
    const assertion = expect(pending).rejects.toThrow(/^timeout$/);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("leaves no timer behind once the promise settles", async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve(1), 10_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits unbounded for a non-positive or non-finite timeout", async () => {
    vi.useFakeTimers();
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(withTimeout(Promise.resolve(timeoutMs), timeoutMs)).resolves.toBe(timeoutMs);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});

// OpenClaw 2026.10.1 removed this subpath; any import of it keeps the plugin from
// loading there. The devDependency's older SDK still exports it, so typecheck
// would not catch a reintroduction.
describe("plugin-sdk imports", () => {
  it("never imports the removed infra-runtime barrel", () => {
    const offenders = sourceFiles(join(import.meta.dirname, "..")).filter((file) =>
      /["']openclaw\/plugin-sdk\/infra-runtime["']/.test(readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return ["node_modules", "dist", "coverage", "docs", ".git"].includes(entry.name)
        ? []
        : sourceFiles(path);
    }
    return /\.ts$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}
