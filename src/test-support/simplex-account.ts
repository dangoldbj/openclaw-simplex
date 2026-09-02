import type { ResolvedSimplexAccount } from "../types/config.js";

/**
 * Builds a resolved SimpleX account for tests.
 *
 * The same seven-field base was written out in eight test files, so every change
 * to `ResolvedSimplexAccount` meant editing all of them.
 *
 * Test-only: nothing under `src/test-support` is reachable from the plugin
 * entrypoints, so it is not part of the published bundle.
 */
export function testSimplexAccount(
  overrides: Partial<ResolvedSimplexAccount> = {}
): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "external",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    config: {
      connection: { wsHost: "127.0.0.1", wsPort: 5225 },
    },
    // Overrides replace rather than merge, matching the fixtures this consolidates:
    // a test that supplies `config` states the whole config it wants.
    ...overrides,
  };
}
