import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { resolveSimplexHealthState } from "../shared/simplex-common.js";

export function buildSimplexStatus(): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["status"]> {
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

        return issues;
      }),
    buildChannelSummary: ({ snapshot, account }) => {
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
        healthState: resolveSimplexHealthState({
          configured: snapshot.configured ?? false,
          running: snapshot.running ?? false,
          connected: snapshot.connected ?? false,
          lastError: snapshot.lastError ?? null,
        }),
        mode: snapshot.mode ?? null,
        dbFilePrefix: account.dbFilePrefix,
      };
    },
    buildAccountSnapshot: async ({ account, runtime }) => {
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
        lastEventAt: runtime?.lastEventAt ?? null,
        application: {
          dbFilePrefix: account.dbFilePrefix,
        },
      };
    },
  };
}
