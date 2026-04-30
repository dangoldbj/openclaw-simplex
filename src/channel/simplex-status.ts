import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import type { ResolvedSimplexAccount } from "../config/types.js";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import {
  DEFAULT_ACCOUNT_ID,
  extractSimplexTransportWarningsFromApplication,
  extractSimplexWsUrlFromApplication,
  resolveSimplexHealthState,
} from "./simplex-common.js";
import { describeSimplexWsEndpointSecurity } from "./simplex-transport-security.js";

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
        const issues = [];
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (lastError) {
          issues.push({
            channel: SIMPLEX_CHANNEL_ID,
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          });
        }

        const transportWarnings = extractSimplexTransportWarningsFromApplication(
          account.application
        );
        for (const warning of transportWarnings) {
          issues.push({
            channel: SIMPLEX_CHANNEL_ID,
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Transport warning: ${warning}`,
          });
        }
        return issues;
      }),
    buildChannelSummary: ({ snapshot, account }) => {
      const wsUrl =
        extractSimplexWsUrlFromApplication(snapshot.application) ?? account.wsUrl ?? null;
      const security = wsUrl
        ? describeSimplexWsEndpointSecurity(wsUrl, {
            allowUnsafeRemoteWs: account.config.connection?.allowUnsafeRemoteWs === true,
          })
        : null;
      return {
        configured: snapshot.configured ?? false,
        running: snapshot.running ?? false,
        connected: snapshot.connected ?? false,
        lastStartAt: snapshot.lastStartAt ?? null,
        lastStopAt: snapshot.lastStopAt ?? null,
        lastError: snapshot.lastError ?? null,
        lastConnectedAt: snapshot.lastConnectedAt ?? null,
        lastDisconnect: snapshot.lastDisconnect ?? null,
        lastEventAt: snapshot.lastEventAt ?? null,
        healthState:
          security && security.blockingWarnings.length > 0
            ? "error"
            : resolveSimplexHealthState({
                configured: snapshot.configured ?? false,
                running: snapshot.running ?? false,
                connected: snapshot.connected ?? false,
                lastError: snapshot.lastError ?? null,
              }),
        mode: snapshot.mode ?? null,
        wsUrl,
        transportWarnings: security?.warnings ?? [],
      };
    },
    buildAccountSnapshot: async ({ account, runtime }) => {
      const wsUrl = extractSimplexWsUrlFromApplication(runtime?.application) ?? account.wsUrl;
      const security = describeSimplexWsEndpointSecurity(wsUrl, {
        allowUnsafeRemoteWs: account.config.connection?.allowUnsafeRemoteWs === true,
      });
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
        healthState:
          security.blockingWarnings.length > 0
            ? "error"
            : resolveSimplexHealthState({
                configured: account.configured,
                running: runtime?.running ?? false,
                connected: runtime?.connected ?? false,
                lastError: runtime?.lastError ?? null,
              }),
        mode: runtime?.mode ?? account.mode,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
        lastEventAt: runtime?.lastEventAt ?? null,
        application: {
          wsUrl,
          transportWarnings: security.warnings,
          transportBlocked: security.blockingWarnings.length > 0,
        },
      };
    },
  };
}
