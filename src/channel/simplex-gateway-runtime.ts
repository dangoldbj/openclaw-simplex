import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import type { ResolvedSimplexAccount } from "../config/types.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import { startSimplexMonitor } from "./simplex-monitor.js";

export function buildSimplexGatewayRuntime(
  activeClients: SimplexClientRegistry
): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["gateway"]> {
  return {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info?.(`[${account.accountId}] SimpleX start requested (wsUrl=${account.wsUrl})`);
      ctx.setStatus({
        accountId: account.accountId,
        mode: account.mode,
        application: { wsUrl: account.wsUrl },
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
