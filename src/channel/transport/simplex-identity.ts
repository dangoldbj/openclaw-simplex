import type { ChannelAccountSnapshot } from "openclaw/plugin-sdk/channel-contract";
import { withTimeout } from "openclaw/plugin-sdk/infra-runtime";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { describeError } from "../../errors.js";
import type { SimplexClient } from "../../simplex/runtime/client.js";

/**
 * Bounded well below the account's `commandTimeoutMs` (20s by default): this
 * runs on the connect path, and a runtime that cannot answer one command
 * promptly is already the problem being reported.
 */
const IDENTITY_PROBE_TIMEOUT_MS = 5000;

/**
 * Confirms the endpoint actually speaks the SimpleX protocol after connecting.
 *
 * The SimpleX WebSocket API is unauthenticated by design, so the plugin will
 * otherwise talk to whatever holds the port — a stale service, the wrong port in
 * config, or a local process that got there first. `/version` is used rather
 * than `/user` because it answers before any profile exists, so a fresh runtime
 * with no user still passes.
 *
 * A failure is reported, never thrown: the monitor stays up so a slow runtime
 * still recovers on its own, but the account is marked unhealthy instead of
 * looking connected while nothing works.
 */
export async function verifySimplexRuntimeIdentity(params: {
  client: Pick<SimplexClient, "runCommand">;
  accountId: string;
  wsUrl: string;
  runtime: RuntimeEnv;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
}): Promise<boolean> {
  try {
    await withTimeout(params.client.runCommand("/version"), IDENTITY_PROBE_TIMEOUT_MS, {
      message: `did not answer /version within ${IDENTITY_PROBE_TIMEOUT_MS}ms`,
    });
    return true;
  } catch (error) {
    const detail = `SimpleX endpoint ${params.wsUrl} did not respond as a simplex-chat runtime: ${describeError(error)}. Check that simplex-chat is listening on this port and that nothing else has taken it.`;
    params.runtime.error?.(`[${params.accountId}] ${detail}`);
    params.statusSink?.({
      healthState: "error",
      lastError: detail,
    });
    return false;
  }
}
