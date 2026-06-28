import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { describeSimplexWsEndpointSecurity } from "../../simplex/runtime/security.js";
import {
  probeSimplexRuntimeCapabilities,
  type SimplexRuntimeCapabilityReport,
} from "../../simplex/services/runtime-capabilities.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { resolveSimplexHealthState } from "../shared/simplex-common.js";

/**
 * WS endpoint security only applies to the external runtime. In native mode the
 * core runs in-process (no network endpoint), so report no transport warnings.
 */
function resolveEndpointSecurity(account: ResolvedSimplexAccount) {
  if (account.mode === "native") {
    return {
      valid: true,
      redactedUrl: "",
      warnings: [] as string[],
      blockingWarnings: [] as string[],
    };
  }
  return describeSimplexWsEndpointSecurity(account.wsUrl, {
    allowUnsafeRemoteWs: account.config.connection?.allowUnsafeRemoteWs,
  });
}

export function buildSimplexStatus(): NonNullable<
  ChannelPlugin<ResolvedSimplexAccount, SimplexRuntimeCapabilityReport>["status"]
> {
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

        const transportWarnings = (
          account.application as { transportWarnings?: unknown } | undefined
        )?.transportWarnings;
        if (Array.isArray(transportWarnings)) {
          for (const warning of transportWarnings) {
            if (typeof warning === "string" && warning.trim()) {
              issues.push({
                channel: SIMPLEX_CHANNEL_ID,
                accountId: account.accountId,
                kind: "runtime" as const,
                message: `Transport warning: ${warning}`,
              });
            }
          }
        }
        return issues;
      }),
    buildChannelSummary: ({ snapshot, account }) => {
      const configured = snapshot.configured ?? account.configured;
      const running = snapshot.running ?? false;
      const connected = snapshot.connected ?? false;
      const lastError = snapshot.lastError ?? null;
      const security = resolveEndpointSecurity(account);
      return {
        configured,
        running,
        connected,
        lastStartAt: snapshot.lastStartAt ?? null,
        lastStopAt: snapshot.lastStopAt ?? null,
        lastError,
        lastConnectedAt: snapshot.lastConnectedAt ?? null,
        lastDisconnect: snapshot.lastDisconnect ?? null,
        lastEventAt: snapshot.lastEventAt ?? null,
        healthState:
          security.blockingWarnings.length > 0
            ? "error"
            : resolveSimplexHealthState({
                configured,
                running,
                connected,
                lastError,
              }),
        mode: snapshot.mode ?? account.mode,
        wsUrl: account.wsUrl,
        transportWarnings: security.warnings,
        capabilities:
          (snapshot.application as { capabilities?: SimplexRuntimeCapabilityReport } | undefined)
            ?.capabilities ?? null,
      };
    },
    probeAccount: async ({ account }) => {
      const result = await probeSimplexRuntimeCapabilities({ account });
      return result.capabilities;
    },
    formatCapabilitiesProbe: ({ probe }) => [
      { text: `SimpleX version: ${probe.version.state}` },
      { text: `SimpleX active user: ${probe.activeUser.state}` },
      { text: `SimpleX users: ${probe.users.state} (${probe.users.count ?? "unknown"})` },
      { text: `SimpleX contacts: ${probe.contacts.state} (${probe.contacts.count ?? "unknown"})` },
      {
        text: `SimpleX groups directory: ${probe.groups.state} (${probe.groups.count ?? "unknown"}, advisory)`,
      },
      { text: `SimpleX live replies: ${probe.liveMessages.state}` },
      { text: `SimpleX TTL: ${probe.ttl.state}` },
      { text: `SimpleX verification: ${probe.verification.state}` },
      { text: `SimpleX moderation: ${probe.moderation.state}` },
      { text: `SimpleX file controls: ${probe.files.state}` },
      { text: `SimpleX channels: ${probe.experimentalChannels.state}` },
    ],
    buildAccountSnapshot: async ({ account, runtime, probe }) => {
      const security = resolveEndpointSecurity(account);
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
          wsUrl: account.wsUrl,
          transportWarnings: security.warnings,
          transportBlocked: security.blockingWarnings.length > 0,
          liveMessages: account.config.streaming?.nativeTransport === true,
          messageTtlSeconds: account.config.messageTtlSeconds ?? null,
          capabilities: probe ?? null,
          filePolicy: {
            autoAccept:
              account.config.filePolicy?.autoAccept ??
              account.config.connection?.autoAcceptFiles ??
              false,
            maxSizeMb: account.config.filePolicy?.maxSizeMb ?? null,
            mediaMaxMb: account.config.mediaMaxMb ?? null,
          },
          experimentalChannels: account.config.experimentalChannels === true,
        },
      };
    },
  };
}
