/**
 * Settles with `promise`, or rejects with `message` (default `"timeout"`) if it
 * has not settled within `timeoutMs`. A non-positive or non-finite timeout
 * waits for `promise` unbounded.
 *
 * OpenClaw 2026.10.1 removed `openclaw/plugin-sdk/infra-runtime`, which is
 * where this helper used to come from, and the SDK has no public replacement
 * for it. Importing that subpath stops the plugin from loading on 2026.10.1, so
 * the plugin keeps its own copy, with the same behaviour for the options it uses.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  options: { message?: string } = {}
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return await promise;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(options.message ?? "timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
