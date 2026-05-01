import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
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
      ctx.log?.info?.(`[${account.accountId}] SimpleX start requested (mode=${account.mode})`);
      ctx.setStatus({
        accountId: account.accountId,
        mode: account.mode,
        application: {
          dbFilePrefix: account.dbFilePrefix,
        },
      });

      ctx.log?.info?.(`[${account.accountId}] Starting SimpleX monitor`);
      const monitor = await startSimplexMonitor({
        account,
        cfg: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: account.accountId, ...patch }),
      });
      ctx.log?.info?.(`[${account.accountId}] SimpleX monitor started`);

      await registerActiveSimplexClient(account, monitor.client);

      await new Promise<void>((resolve) => {
        ctx.abortSignal.addEventListener(
          "abort",
          () => {
            resolve();
          },
          { once: true }
        );
      });

      unregisterActiveSimplexClient(account, monitor.client);
      await monitor.client.close().catch(() => undefined);
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
