import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { SimplexWsClient } from "../../simplex/simplex-ws-client.js";

export async function connectSimplexWithRetry(params: {
  client: SimplexWsClient;
  runtime: RuntimeEnv;
  accountId: string;
  abortSignal: AbortSignal;
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}): Promise<void> {
  const attempts = params.attempts ?? 10;
  let delayMs = params.baseDelayMs ?? 500;
  const maxDelayMs = params.maxDelayMs ?? 5_000;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (params.abortSignal.aborted) {
      throw new Error("SimpleX connect aborted");
    }
    try {
      await params.client.connect();
      return;
    } catch (err) {
      if (attempt >= attempts) {
        throw err;
      }
      params.runtime.error?.(
        `[${params.accountId}] SimpleX connect failed (attempt ${attempt}/${attempts}): ${String(err)}; retrying in ${delayMs}ms`
      );
      await sleep(delayMs, params.abortSignal);
      delayMs = Math.min(maxDelayMs, delayMs * 2);
    }
  }
}

function sleep(ms: number, abortSignal: AbortSignal): Promise<void> {
  if (abortSignal.aborted) {
    return Promise.reject(new Error("SimpleX connect aborted"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new Error("SimpleX connect aborted"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      abortSignal.removeEventListener("abort", onAbort);
    };
    abortSignal.addEventListener("abort", onAbort, { once: true });
  });
}
