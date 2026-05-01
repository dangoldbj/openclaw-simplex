import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import { resolveSimplexCliDefaultDbPrefix } from "../simplex/simplex-db-path.js";
import type { ResolvedSimplexAccount, SimplexConnectionConfig } from "../types/config.js";
import type { SimplexAccountConfig, SimplexChannelConfig } from "./config-schema.js";

export const SIMPLEX_CLI_DEFAULT_DB_PREFIX = resolveSimplexCliDefaultDbPrefix();

type LegacySimplexAccountConfig = SimplexAccountConfig & {
  connection?: SimplexConnectionConfig;
};

function flattenRuntimeConfig(config: LegacySimplexAccountConfig): SimplexAccountConfig {
  const { connection, ...rest } = config;
  const flattened: SimplexAccountConfig = { ...rest };
  for (const [key, value] of Object.entries({
    dbFilePrefix: rest.dbFilePrefix ?? connection?.dbFilePrefix,
    displayName: rest.displayName ?? connection?.displayName,
    fullName: rest.fullName ?? connection?.fullName,
    migrationConfirmation: rest.migrationConfirmation ?? connection?.migrationConfirmation,
    autoAcceptFiles: rest.autoAcceptFiles ?? connection?.autoAcceptFiles,
    connectTimeoutMs: rest.connectTimeoutMs ?? connection?.connectTimeoutMs,
  }) as Array<[keyof SimplexAccountConfig, unknown]>) {
    if (value !== undefined) {
      flattened[key] = value as never;
    }
  }
  return flattened;
}

function resolveRawSimplexAccountConfig(
  cfg: OpenClawConfig,
  accountId: string
): SimplexAccountConfig {
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const { accounts: _ignored, ...base } = (cfg.channels?.[SIMPLEX_CHANNEL_ID] ??
      {}) as LegacySimplexAccountConfig & SimplexChannelConfig;
    return flattenRuntimeConfig(base);
  }
  return flattenRuntimeConfig(
    (cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts?.[accountId] ?? {}) as LegacySimplexAccountConfig
  );
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
  if (!params.cfg.channels || !(SIMPLEX_CHANNEL_ID in params.cfg.channels)) {
    return false;
  }
  const accountId = normalizeAccountId(params.accountId);
  const raw = resolveRawSimplexAccountConfig(params.cfg, accountId);
  if (raw.dbFilePrefix?.trim()) {
    return true;
  }
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return true;
  }
  return Boolean(
    resolveRawSimplexAccountConfig(params.cfg, DEFAULT_ACCOUNT_ID).dbFilePrefix?.trim()
  );
}

function mergeSimplexAccountConfig(cfg: OpenClawConfig, accountId: string): SimplexAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.[SIMPLEX_CHANNEL_ID] ??
    {}) as LegacySimplexAccountConfig & SimplexChannelConfig;
  const account = (cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts?.[accountId] ??
    {}) as LegacySimplexAccountConfig;
  return {
    ...flattenRuntimeConfig(base),
    ...flattenRuntimeConfig(account),
  };
}

function resolveNodeDbFilePrefix(
  config: SimplexAccountConfig,
  accountId: string
): string | undefined {
  const configured = config.dbFilePrefix?.trim();
  if (configured) {
    return configured;
  }
  return accountId === DEFAULT_ACCOUNT_ID ? SIMPLEX_CLI_DEFAULT_DB_PREFIX : undefined;
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
  const configured = hasMeaningfulConfig;
  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    configured,
    mode: "node",
    dbFilePrefix: resolveNodeDbFilePrefix(merged, accountId),
    config: merged,
  };
}

export function listEnabledSimplexAccounts(cfg: OpenClawConfig): ResolvedSimplexAccount[] {
  return listSimplexAccountIds(cfg)
    .map((accountId) => resolveSimplexAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
