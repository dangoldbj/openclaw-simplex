import os from "node:os";
import path from "node:path";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import type { ResolvedSimplexAccount, SimplexConnectionConfig } from "../types/config.js";
import type { SimplexAccountConfig, SimplexChannelConfig } from "./config-schema.js";

const DEFAULT_WS_HOST = "127.0.0.1";
const DEFAULT_WS_PORT = 5225;

/**
 * OpenClaw's state directory (mutable data), overridable via OPENCLAW_STATE_DIR,
 * default ~/.openclaw — mirrors the gateway's own resolution. Used to anchor the
 * default native database location so it lands beside the rest of OpenClaw's
 * state regardless of the gateway's working directory.
 */
function resolveOpenClawStateDir(): string {
  const override = process.env.OPENCLAW_STATE_DIR?.trim();
  if (override) {
    return override;
  }
  return path.join(os.homedir(), ".openclaw");
}

/**
 * Default native db file prefix for an account. The core creates
 * `<prefix>_chat.db` and `<prefix>_agent.db`, so we namespace per account under
 * the state dir to keep multiple accounts isolated.
 */
function resolveDefaultNativeFilePrefix(accountId: string): string {
  return path.join(resolveOpenClawStateDir(), "simplex", accountId || DEFAULT_ACCOUNT_ID);
}

function hasMeaningfulConnectionConfig(connection: SimplexConnectionConfig | undefined): boolean {
  if (!connection) {
    return false;
  }
  return Boolean(
    connection.wsUrl?.trim() ||
      connection.wsHost?.trim() ||
      connection.wsPort !== undefined ||
      // Native mode is self-configuring: the database path defaults under the
      // OpenClaw state dir, so selecting the mode is enough.
      connection.mode === "native"
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

function resolveWsHost(connection: SimplexConnectionConfig): string {
  return connection.wsHost?.trim() || DEFAULT_WS_HOST;
}

function resolveWsPort(connection: SimplexConnectionConfig): number {
  return connection.wsPort ?? DEFAULT_WS_PORT;
}

function resolveWsUrl(connection: SimplexConnectionConfig): string {
  if (connection.wsUrl?.trim()) {
    return connection.wsUrl.trim();
  }
  const host = resolveWsHost(connection);
  const port = resolveWsPort(connection);
  return `ws://${host}:${port}`;
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
  const mode = connection.mode === "native" ? "native" : "external";
  const wsUrl = resolveWsUrl(connection);
  const wsHost = resolveWsHost(connection);
  const wsPort = resolveWsPort(connection);
  const db = connection.db?.filePrefix?.trim()
    ? {
        filePrefix: connection.db.filePrefix.trim(),
        ...(connection.db.encryptionKey ? { encryptionKey: connection.db.encryptionKey } : {}),
      }
    : mode === "native"
      ? { filePrefix: resolveDefaultNativeFilePrefix(accountId) }
      : undefined;
  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    configured: hasMeaningfulConfig,
    mode,
    wsUrl,
    wsHost,
    wsPort,
    ...(db ? { db } : {}),
    ...(connection.profile ? { profile: connection.profile } : {}),
    ...(connection.addressSettings ? { addressSettings: connection.addressSettings } : {}),
    ...(connection.servers ? { servers: connection.servers } : {}),
    config: merged,
  };
}

export function listEnabledSimplexAccounts(cfg: OpenClawConfig): ResolvedSimplexAccount[] {
  return listSimplexAccountIds(cfg)
    .map((accountId) => resolveSimplexAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}

/**
 * Guard against two enabled native accounts resolving to the same db.filePrefix.
 * The embedded core cannot be opened twice on the same SQLite database, so a
 * shared prefix would corrupt or lock it. Throws with the conflicting accounts.
 */
export function assertUniqueNativeDbPrefixes(cfg: OpenClawConfig): void {
  const accountsByPrefix = new Map<string, string[]>();
  for (const account of listEnabledSimplexAccounts(cfg)) {
    const prefix = account.mode === "native" ? account.db?.filePrefix : undefined;
    if (!prefix) {
      continue;
    }
    const ids = accountsByPrefix.get(prefix) ?? [];
    ids.push(account.accountId);
    accountsByPrefix.set(prefix, ids);
  }
  const conflicts = [...accountsByPrefix.entries()].filter(([, ids]) => ids.length > 1);
  if (conflicts.length === 0) {
    return;
  }
  const detail = conflicts
    .map(([prefix, ids]) => `${prefix} (accounts: ${ids.join(", ")})`)
    .join("; ");
  throw new Error(
    `SimpleX native accounts must each use a unique db.filePrefix — the embedded core ` +
      `cannot be opened twice on the same database. Conflicting prefixes: ${detail}`
  );
}
