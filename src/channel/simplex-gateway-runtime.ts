import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { startSimplexCli } from "./simplex-cli.js";
import { startSimplexMonitor } from "./simplex-monitor.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import { SimplexWsClient } from "../simplex/simplex-ws-client.js";

async function sleep(ms: number, abortSignal: AbortSignal): Promise<void> {
  if (abortSignal.aborted) {
    throw new Error("SimpleX connect aborted");
  }
  await new Promise<void>((resolve, reject) => {
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

async function waitForSimplexWs(params: {
  account: ResolvedSimplexAccount;
  abortSignal: AbortSignal;
  log?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
    debug?: (message: string) => void;
  };
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}): Promise<void> {
  const attempts = params.attempts ?? 6;
  let delayMs = params.baseDelayMs ?? 300;
  const maxDelayMs = params.maxDelayMs ?? 2_000;
  const connectTimeoutMs = Math.min(
    2_000,
    params.account.config.connection?.connectTimeoutMs ?? 2_000
  );
  params.log?.info?.(
    `[${params.account.accountId}] SimpleX waiting for WS at ${params.account.wsUrl} (attempts=${attempts}, timeoutMs=${connectTimeoutMs})`
  );

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (params.abortSignal.aborted) {
      throw new Error("SimpleX connect aborted");
    }
    const client = new SimplexWsClient({ url: params.account.wsUrl, connectTimeoutMs });
    try {
      params.log?.info?.(
        `[${params.account.accountId}] SimpleX WS probe attempt ${attempt}/${attempts}: ${params.account.wsUrl}`
      );
      await client.connect();
      await client.close().catch(() => undefined);
      params.log?.info?.(
        `[${params.account.accountId}] SimpleX WS probe succeeded: ${params.account.wsUrl}`
      );
      return;
    } catch (err) {
      await client.close().catch(() => undefined);
      if (attempt >= attempts) {
        throw err;
      }
      params.log?.debug?.(
        `[${params.account.accountId}] SimpleX preflight failed (attempt ${attempt}/${attempts}): ${String(
          err
        )}; retrying in ${delayMs}ms`
      );
      await sleep(delayMs, params.abortSignal);
      delayMs = Math.min(maxDelayMs, delayMs * 2);
    }
  }
}

export function buildSimplexGatewayRuntime(
  activeClients: SimplexClientRegistry
): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["gateway"]> {
  return {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info?.(
        `[${account.accountId}] SimpleX start requested (mode=${account.mode}, wsUrl=${account.wsUrl}, cliPath=${account.cliPath}, dataDir=${account.dataDir ?? "default"})`
      );
      ctx.setStatus({
        accountId: account.accountId,
        mode: account.mode,
        application: { wsUrl: account.wsUrl },
      });

      let cliHandle: ReturnType<typeof startSimplexCli> | null = null;
      if (account.mode === "managed") {
        ctx.log?.info?.(
          `[${account.accountId}] Starting SimpleX CLI (cliPath=${account.cliPath}, wsPort=${account.wsPort}, dataDir=${account.dataDir ?? "default"})`
        );
        cliHandle = startSimplexCli({
          cliPath: account.cliPath,
          wsPort: account.wsPort,
          dataDir: account.dataDir,
          logCliOutput: account.config.connection?.logCliOutput,
          log: ctx.log,
        });
        let cliReady = false;
        try {
          await cliHandle.ready;
          cliReady = true;
          ctx.log?.info?.(
            `[${account.accountId}] SimpleX CLI spawned; waiting for WS readiness at ${account.wsUrl}`
          );
          await waitForSimplexWs({ account, abortSignal: ctx.abortSignal, log: ctx.log });
          ctx.log?.info?.(`[${account.accountId}] SimpleX managed WS is ready: ${account.wsUrl}`);
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          ctx.setStatus({
            accountId: account.accountId,
            connected: false,
            running: false,
            lastDisconnect: { at: Date.now(), error: detail },
            lastError: cliReady
              ? `SimpleX CLI not ready: ${detail}`
              : `SimpleX CLI failed: ${detail}`,
            healthState: "error",
          });
          await cliHandle.stop().catch(() => undefined);
          throw err;
        }
      }

      ctx.log?.info?.(`[${account.accountId}] Starting SimpleX monitor`);
      const monitor = await startSimplexMonitor({
        account,
        cfg: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: account.accountId, ...patch }),
      });
      ctx.log?.info?.(`[${account.accountId}] SimpleX monitor started`);

      activeClients.set(account.accountId, monitor.client);

      await new Promise<void>((resolve) => {
        ctx.abortSignal.addEventListener(
          "abort",
          () => {
            resolve();
          },
          { once: true }
        );
      });

      activeClients.delete(account.accountId);
      await monitor.client.close().catch(() => undefined);
      await cliHandle?.stop().catch(() => undefined);
    },
    stopAccount: async (ctx) => {
      const client = activeClients.get(ctx.account.accountId);
      if (client) {
        await client.close();
        activeClients.delete(ctx.account.accountId);
      }
    },
  };
}
