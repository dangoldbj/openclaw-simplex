import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import {
  DEFAULT_SIMPLEX_WS_HOST,
  DEFAULT_SIMPLEX_WS_PORT,
  SIMPLEX_CHANNEL_ID,
} from "../constants.js";
import type {
  ResolvedSimplexAccount,
  SimplexAccountScope,
  SimplexConnectionConfig,
} from "../types/config.js";
import type { SimplexAccountConfig, SimplexChannelConfig } from "./config-schema.js";

function hasMeaningfulConnectionConfig(connection: SimplexConnectionConfig | undefined): boolean {
  if (!connection) {
    return false;
  }
  return Boolean(
    connection.wsUrl?.trim() || connection.wsHost?.trim() || connection.wsPort !== undefined
  );
}

function resolveRawSimplexAccountConfig(
  cfg: OpenClawConfig,
  accountId: string
): SimplexAccountConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const { accounts: _ignored, ...base } = (cfg.channels?.[SIMPLEX_CHANNEL_ID] ??
      {}) as SimplexChannelConfig;
    return base;
  }
  return (cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts?.[accountId] ?? {}) as SimplexAccountConfig;
}

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listSimplexAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultSimplexAccountId(cfg: OpenClawConfig): string {
  const ids = listSimplexAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

export function hasMeaningfulSimplexConfig(params: SimplexAccountScope): boolean {
  const accountId = normalizeAccountId(params.accountId);
  const raw = resolveRawSimplexAccountConfig(params.cfg, accountId);
  return hasMeaningfulConnectionConfig(raw.connection);
}

function mergeConnection(
  base: SimplexConnectionConfig = {},
  account: SimplexConnectionConfig = {}
): SimplexConnectionConfig {
  return {
    ...base,
    ...account,
  };
}

function mergeSimplexAccountConfig(cfg: OpenClawConfig, accountId: string): SimplexAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.[SIMPLEX_CHANNEL_ID] ??
    {}) as SimplexChannelConfig;
  const account = (cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts?.[accountId] ??
    {}) as SimplexAccountConfig;
  return {
    ...base,
    ...account,
    connection: mergeConnection(base.connection, account.connection),
  };
}

function resolveWsHost(connection: SimplexConnectionConfig): string {
  return connection.wsHost?.trim() || DEFAULT_SIMPLEX_WS_HOST;
}

function resolveWsPort(connection: SimplexConnectionConfig): number {
  return connection.wsPort ?? DEFAULT_SIMPLEX_WS_PORT;
}

function resolveWsUrl(connection: SimplexConnectionConfig): string {
  if (connection.wsUrl?.trim()) {
    return connection.wsUrl.trim();
  }
  const host = resolveWsHost(connection);
  const port = resolveWsPort(connection);
  return `ws://${host}:${port}`;
}

export function resolveSimplexAccount(params: SimplexAccountScope): ResolvedSimplexAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = mergeSimplexAccountConfig(params.cfg, accountId);
  const hasMeaningfulConfig = hasMeaningfulSimplexConfig({ cfg: params.cfg, accountId });
  const baseEnabled = params.cfg.channels?.[SIMPLEX_CHANNEL_ID]?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const connection = merged.connection ?? {};
  const wsUrl = resolveWsUrl(connection);
  const wsHost = resolveWsHost(connection);
  const wsPort = resolveWsPort(connection);
  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    configured: hasMeaningfulConfig,
    mode: "external",
    wsUrl,
    wsHost,
    wsPort,
    config: merged,
  };
}

export function listEnabledSimplexAccounts(cfg: OpenClawConfig): ResolvedSimplexAccount[] {
  return listSimplexAccountIds(cfg)
    .map((accountId) => resolveSimplexAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

/**
 * Rejects an account that cannot serve traffic.
 *
 * Lives here rather than in the channel layer so the runtime layer can share it
 * without depending upwards: the outbound path and `resolveRuntimeAccount` were
 * carrying byte-identical checks and error strings.
 */
export function assertSimplexAccountReady(account: ResolvedSimplexAccount): void {
  if (!account.enabled) {
    throw new Error(`SimpleX account "${account.accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${account.accountId}" is not configured`);
  }
}

/**
 * Reply quoting defaults to `first` rather than the host's `all`: a SimpleX
 * quote embeds the quoted message, so quoting every part repeats it each time.
 */
export function resolveSimplexReplyToMode(
  account: ResolvedSimplexAccount
): NonNullable<SimplexAccountConfig["replyToMode"]> {
  return account.config.replyToMode ?? "first";
}
