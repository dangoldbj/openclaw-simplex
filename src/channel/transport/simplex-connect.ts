import {
  type BackoffPolicy,
  computeBackoff,
  type RuntimeEnv,
  sleepWithAbort,
} from "openclaw/plugin-sdk/runtime-env";
import type { SimplexClient } from "../../simplex/runtime/client.js";

const ABORTED_MESSAGE = "SimpleX connect aborted";

/**
 * Jitter matters here: the common failure is a `simplex-chat` restart, which
 * knocks out every configured account at once. Without it they would all retry
 * on the same schedule and hammer the runtime in lockstep as it comes back up.
 */
const BACKOFF_JITTER = 0.2;

export async function connectSimplexWithRetry(params: {
  client: SimplexClient;
  runtime: RuntimeEnv;
  accountId: string;
  abortSignal: AbortSignal;
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}): Promise<void> {
  const attempts = params.attempts ?? Number.POSITIVE_INFINITY;
  const attemptsLabel = Number.isFinite(attempts) ? String(attempts) : "unbounded";
  const backoff: BackoffPolicy = {
    initialMs: params.baseDelayMs ?? 500,
    maxMs: params.maxDelayMs ?? 5_000,
    factor: 2,
    jitter: BACKOFF_JITTER,
  };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (params.abortSignal.aborted) {
      throw new Error(ABORTED_MESSAGE);
    }
    try {
      await params.client.connect();
      return;
    } catch (err) {
      if (params.abortSignal.aborted) {
        throw new Error(ABORTED_MESSAGE);
      }
      if (attempt >= attempts) {
        throw err;
      }
      const delayMs = computeBackoff(backoff, attempt);
      params.runtime.error?.(
        `[${params.accountId}] SimpleX connect failed (attempt ${attempt}/${attemptsLabel}): ${String(err)}; retrying in ${delayMs}ms`
      );
      // `sleepWithAbort` rejects with an AbortError; the caller contract is a
      // single recognizable abort failure, so it is normalized here.
      await sleepWithAbort(delayMs, params.abortSignal).catch(() => {
        throw new Error(ABORTED_MESSAGE);
      });
    }
  }
}
