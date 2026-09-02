import type { SimplexAccountScope } from "../../types/config.js";
import { resolveRuntimeAccount } from "../runtime/account.js";
import { describeSimplexWsEndpointSecurity } from "../runtime/security.js";
import { getActiveSimplexClient } from "../runtime/transport.js";
import {
  collectSimplexCapabilityIssues,
  probeSimplexRuntimeCapabilities,
  type SimplexRuntimeCapabilityReport,
} from "./runtime-capabilities.js";

export type SimplexRuntimeStatusResult = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  mode: string;
  wsUrl: string | null;
  runtimeVersion: string | null;
  runtime: {
    activeClient: boolean;
    connected: boolean;
    lastStateAt: number | null;
    expectedDisconnect: boolean | null;
    lastError: string | null;
  };
  activeUser: unknown;
  address: unknown;
  counts: {
    contacts: number;
    groups: number;
    users: number;
  };
  capabilities: SimplexRuntimeCapabilityReport;
  security: {
    transportWarnings: string[];
    transportBlocked: boolean;
  };
  filePolicy: {
    autoAccept: boolean;
    maxSizeMb: number | null;
    mediaMaxMb: number | null;
  };
};

export async function getSimplexRuntimeStatus(
  params: SimplexAccountScope
): Promise<SimplexRuntimeStatusResult> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const activeClient = getActiveSimplexClient(account.accountId);
  const connection = activeClient?.getConnectionState();
  const security = describeSimplexWsEndpointSecurity(account.wsUrl, {
    allowUnsafeRemoteWs: account.config.connection?.allowUnsafeRemoteWs,
  });
  const fileAutoAccept =
    account.config.filePolicy?.autoAccept ?? account.config.connection?.autoAcceptFiles ?? false;
  const details = await probeSimplexRuntimeCapabilities({ account });

  return {
    accountId: account.accountId,
    enabled: account.enabled,
    configured: account.configured,
    mode: account.mode,
    wsUrl: account.wsUrl ?? null,
    runtimeVersion: details.capabilities.runtimeVersion,
    runtime: {
      activeClient: Boolean(activeClient),
      connected: connection?.connected ?? true,
      lastStateAt: connection?.at ?? null,
      expectedDisconnect: connection?.expected ?? null,
      lastError: connection?.error ?? null,
    },
    activeUser: details.activeUser ?? null,
    address: details.address ?? null,
    counts: {
      contacts: details.contacts.length,
      groups: details.groups.length,
      users: details.users.length,
    },
    capabilities: details.capabilities,
    security: {
      transportWarnings: security.warnings,
      transportBlocked: security.blockingWarnings.length > 0,
    },
    filePolicy: {
      autoAccept: fileAutoAccept,
      maxSizeMb: account.config.filePolicy?.maxSizeMb ?? null,
      mediaMaxMb: account.config.mediaMaxMb ?? null,
    },
  };
}

export async function doctorSimplexRuntime(
  params: SimplexAccountScope
): Promise<SimplexRuntimeStatusResult & { ok: boolean; issues: string[] }> {
  const status = await getSimplexRuntimeStatus(params);
  const issues: string[] = [];
  if (!status.configured) {
    issues.push("SimpleX account is not configured.");
  }
  if (!status.activeUser) {
    issues.push("SimpleX runtime has no active user profile.");
  }
  if (status.capabilities.activeUser.state !== "supported") {
    issues.push(
      `SimpleX active user probe is ${status.capabilities.activeUser.state}${
        status.capabilities.activeUser.error ? `: ${status.capabilities.activeUser.error}` : "."
      }`
    );
  }
  if (status.runtime.lastError) {
    issues.push(`SimpleX runtime error: ${status.runtime.lastError}`);
  }
  for (const warning of status.security.transportWarnings) {
    issues.push(`SimpleX transport warning: ${warning}`);
  }
  if (status.security.transportBlocked) {
    issues.push("SimpleX WebSocket endpoint is blocked by transport security policy.");
  }
  issues.push(
    ...collectSimplexCapabilityIssues({
      account: resolveRuntimeAccount(params.cfg, params.accountId),
      capabilities: status.capabilities,
    })
  );
  return { ...status, ok: issues.length === 0, issues };
}
