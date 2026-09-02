import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { createAccountStatusSink, waitUntilAbort } from "openclaw/plugin-sdk/channel-outbound";
import { describeError } from "../../errors.js";
import {
  getActiveSimplexClient,
  registerActiveSimplexClient,
  unregisterActiveSimplexClient,
} from "../../simplex/runtime/transport.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { startSimplexMonitor } from "../events/simplex-monitor.js";

export function buildSimplexGatewayRuntime(): NonNullable<
  ChannelPlugin<ResolvedSimplexAccount>["gateway"]
> {
  return {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const startedAt = Date.now();
      const setStatus = createAccountStatusSink({
        accountId: account.accountId,
        setStatus: ctx.setStatus,
      });
      ctx.log?.info?.(`[${account.accountId}] SimpleX start requested (mode=${account.mode})`);
      setStatus({
        connected: false,
        running: true,
        lastStartAt: startedAt,
        lastStopAt: null,
        lastError: null,
        healthState: account.configured ? "starting" : "idle",
      });

      ctx.log?.info?.(`[${account.accountId}] Starting SimpleX monitor`);
      const monitor = await startSimplexMonitor({
        account,
        cfg: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: setStatus,
      }).catch((err) => {
        if (!ctx.abortSignal.aborted) {
          setStatus({
            running: false,
            connected: false,
            lastStopAt: Date.now(),
            lastError: describeError(err),
            healthState: "error",
          });
        }
        throw err;
      });
      ctx.log?.info?.(`[${account.accountId}] SimpleX monitor started`);

      await registerActiveSimplexClient(account, monitor.client);
      try {
        await waitUntilAbort(ctx.abortSignal);
      } finally {
        unregisterActiveSimplexClient(account, monitor.client);
        await monitor.client.close().catch(() => undefined);
      }
    },
    stopAccount: async (ctx) => {
      const client = getActiveSimplexClient(ctx.account.accountId);
      if (client) {
        await client.close();
        unregisterActiveSimplexClient(ctx.account, client);
      }
    },
  };
}
