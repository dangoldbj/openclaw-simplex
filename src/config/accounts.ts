import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import type { ResolvedSimplexAccount, SimplexConnectionConfig } from "../types/config.js";
import type { SimplexAccountConfig, SimplexChannelConfig } from "./config-schema.js";

const DEFAULT_NODE_DB_PREFIX = "~/.openclaw/simplex/openclaw-simplex";

function hasMeaningfulConnectionConfig(connection: SimplexConnectionConfig | undefined): boolean {
  if (!connection) {
    return false;
  }
  return Boolean(
    Object.keys(connection).length === 0 ||
      connection.dbFilePrefix?.trim() ||
      connection.displayName?.trim() ||
      connection.fullName?.trim() ||
      connection.migrationConfirmation ||
      connection.autoAcceptFiles !== undefined ||
      connection.connectTimeoutMs !== undefined
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

export function hasMeaningfulSimplexConfig(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): boolean {
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

function resolveNodeDbFilePrefix(connection: SimplexConnectionConfig, accountId: string): string {
  const configured = connection.dbFilePrefix?.trim();
  if (configured) {
    return configured;
  }
  return accountId === DEFAULT_ACCOUNT_ID
    ? DEFAULT_NODE_DB_PREFIX
    : `${DEFAULT_NODE_DB_PREFIX}-${accountId}`;
}

export function resolveSimplexAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedSimplexAccount {
  const accountId = normalizeAccountId(params.accountId);
  const merged = mergeSimplexAccountConfig(params.cfg, accountId);
  const hasMeaningfulConfig = hasMeaningfulSimplexConfig({ cfg: params.cfg, accountId });
  const baseEnabled = params.cfg.channels?.[SIMPLEX_CHANNEL_ID]?.enabled !== false;
  const enabled = baseEnabled && merged.enabled !== false;
  const connection = merged.connection ?? {};
  const configured = hasMeaningfulConfig;
  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    configured,
    mode: "node",
    dbFilePrefix: resolveNodeDbFilePrefix(connection, accountId),
    config: merged,
  };
}

export function listEnabledSimplexAccounts(cfg: OpenClawConfig): ResolvedSimplexAccount[] {
  return listSimplexAccountIds(cfg)
    .map((accountId) => resolveSimplexAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
