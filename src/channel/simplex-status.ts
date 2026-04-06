import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import type { ResolvedSimplexAccount } from "../config/types.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import {
  DEFAULT_ACCOUNT_ID,
  extractSimplexWsUrlFromApplication,
  resolveSimplexHealthState,
} from "./simplex-common.js";

export function buildSimplexStatus(
  _registry: SimplexClientRegistry
): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["status"]> {
  return {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) {
          return [];
        }
        return [
          {
            channel: "openclaw-simplex",
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot, account }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      lastConnectedAt: snapshot.lastConnectedAt ?? null,
      lastDisconnect: snapshot.lastDisconnect ?? null,
      healthState: resolveSimplexHealthState({
        configured: snapshot.configured ?? false,
        running: snapshot.running ?? false,
        connected: snapshot.connected ?? false,
        lastError: snapshot.lastError ?? null,
      }),
      mode: snapshot.mode ?? null,
      wsUrl: extractSimplexWsUrlFromApplication(snapshot.application) ?? account.wsUrl ?? null,
    }),
    buildAccountSnapshot: async ({ account, runtime }) => {
      const wsUrl = extractSimplexWsUrlFromApplication(runtime?.application) ?? account.wsUrl;
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        running: runtime?.running ?? false,
        connected: runtime?.connected ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastConnectedAt: runtime?.lastConnectedAt ?? null,
        lastDisconnect: runtime?.lastDisconnect ?? null,
        lastError: runtime?.lastError ?? null,
        healthState: resolveSimplexHealthState({
          configured: account.configured,
          running: runtime?.running ?? false,
          connected: runtime?.connected ?? false,
          lastError: runtime?.lastError ?? null,
        }),
        mode: runtime?.mode ?? account.mode,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        application: {
          wsUrl,
        },
      };
    },
  };
}
