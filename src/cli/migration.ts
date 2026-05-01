import { access, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  LEGACY_SIMPLEX_CHANNEL_ID,
  LEGACY_SIMPLEX_PLUGIN_ID,
  SIMPLEX_CHANNEL_ID,
  SIMPLEX_PLUGIN_ID,
} from "../constants.js";

const LEGACY_PLUGIN_ID = LEGACY_SIMPLEX_PLUGIN_ID;
const PLUGIN_ID = SIMPLEX_PLUGIN_ID;
const LEGACY_CHANNEL_ID = LEGACY_SIMPLEX_CHANNEL_ID;
const CHANNEL_ID = SIMPLEX_CHANNEL_ID;

type MigrationResult = {
  changed: string[];
  skipped: string[];
};

type SimplexMigrationStateApi = {
  runtime: {
    state: {
      resolveStateDir: () => string;
    };
  };
};

const RUNTIME_CONFIG_KEYS = new Set([
  "dbFilePrefix",
  "displayName",
  "fullName",
  "migrationConfirmation",
  "autoAcceptFiles",
  "connectTimeoutMs",
]);

const LEGACY_RUNTIME_KEYS = new Set([
  "authToken",
  "cliPath",
  "command",
  "headers",
  "host",
  "httpUrl",
  "managed",
  "mode",
  "path",
  "port",
  "process",
  "reconnect",
  "retry",
  "token",
  "url",
  "wsUrl",
]);

const LEGACY_DEFAULT_DB_PREFIX = "~/.openclaw/simplex/openclaw-simplex";

function dedupeStrings(values: unknown[] | undefined): string[] | undefined {
  if (!Array.isArray(values)) {
    return values as string[] | undefined;
  }
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    ),
  ];
}

function mergeObjects<T extends Record<string, unknown>>(
  legacy: T | undefined,
  next: T | undefined
): T | undefined {
  if (!legacy && !next) {
    return undefined;
  }
  if (!legacy) {
    return next;
  }
  if (!next) {
    return legacy;
  }
  const merged: Record<string, unknown> = { ...legacy, ...next };
  if ("connection" in legacy || "connection" in next) {
    merged.connection = {
      ...((legacy.connection as Record<string, unknown> | undefined) ?? {}),
      ...((next.connection as Record<string, unknown> | undefined) ?? {}),
    };
  }
  if ("accounts" in legacy || "accounts" in next) {
    merged.accounts = {
      ...((legacy.accounts as Record<string, unknown> | undefined) ?? {}),
      ...((next.accounts as Record<string, unknown> | undefined) ?? {}),
    };
  }
  return merged as T;
}

function defaultDbFilePrefixForAccount(accountId?: string): string {
  return accountId ? `${LEGACY_DEFAULT_DB_PREFIX}-${accountId}` : LEGACY_DEFAULT_DB_PREFIX;
}

function migrateConnectionConfig(
  account: Record<string, unknown>,
  value: unknown,
  pathLabel: string,
  result: MigrationResult,
  accountId?: string
): void {
  if (value === undefined) {
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    if (account.dbFilePrefix === undefined) {
      account.dbFilePrefix = defaultDbFilePrefixForAccount(accountId);
    }
    delete account.connection;
    result.changed.push(
      `config: replaced invalid ${pathLabel} with dbFilePrefix for the Node runtime`
    );
    return;
  }

  const connection = value as Record<string, unknown>;
  const moved: string[] = [];
  const removed: string[] = [];

  for (const [key, fieldValue] of Object.entries(connection)) {
    if (RUNTIME_CONFIG_KEYS.has(key)) {
      if (account[key] === undefined) {
        account[key] = fieldValue;
        moved.push(key);
      }
    } else {
      removed.push(key);
    }
  }

  if (account.dbFilePrefix === undefined) {
    account.dbFilePrefix = defaultDbFilePrefixForAccount(accountId);
    moved.push("dbFilePrefix");
  }

  delete account.connection;

  if (moved.length > 0) {
    result.changed.push(
      `config: moved runtime field(s) from ${pathLabel} to ${pathLabel.replace(/\.connection$/, "")}: ${[
        ...new Set(moved),
      ]
        .toSorted()
        .join(", ")}`
    );
  }
  if (removed.length > 0) {
    result.changed.push(
      `config: removed legacy runtime field(s) from ${pathLabel}: ${removed.toSorted().join(", ")}`
    );
  }
}

function sanitizeSimplexAccountConfig(
  value: unknown,
  pathLabel: string,
  result: MigrationResult,
  accountId?: string
): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value as Record<string, unknown> | undefined;
  }
  const account = { ...(value as Record<string, unknown>) };
  const removed: string[] = [];

  for (const key of Object.keys(account)) {
    if (LEGACY_RUNTIME_KEYS.has(key)) {
      delete account[key];
      removed.push(key);
    }
  }
  if (removed.length > 0) {
    result.changed.push(
      `config: removed legacy runtime field(s) from ${pathLabel}: ${removed.toSorted().join(", ")}`
    );
  }

  if ("connection" in account) {
    migrateConnectionConfig(
      account,
      account.connection,
      `${pathLabel}.connection`,
      result,
      accountId
    );
  }

  return account;
}

function sanitizeSimplexChannelConfig(channel: unknown, result: MigrationResult): unknown {
  if (!channel || typeof channel !== "object" || Array.isArray(channel)) {
    return channel;
  }

  const next = sanitizeSimplexAccountConfig(channel, `channels.${CHANNEL_ID}`, result) as Record<
    string,
    unknown
  >;
  const accounts =
    next.accounts && typeof next.accounts === "object" && !Array.isArray(next.accounts)
      ? (next.accounts as Record<string, unknown>)
      : null;

  if (accounts) {
    const sanitizedAccounts: Record<string, unknown> = {};
    for (const [accountId, account] of Object.entries(accounts)) {
      sanitizedAccounts[accountId] = sanitizeSimplexAccountConfig(
        account,
        `channels.${CHANNEL_ID}.accounts.${accountId}`,
        result,
        accountId
      );
    }
    next.accounts = sanitizedAccounts;
  }

  return next;
}

export function migrateConfigObject(rawConfig: Record<string, unknown>): {
  nextConfig: Record<string, unknown>;
  result: MigrationResult;
} {
  const result: MigrationResult = { changed: [], skipped: [] };
  const nextConfig: Record<string, unknown> = {
    ...rawConfig,
    plugins: { ...((rawConfig.plugins as Record<string, unknown> | undefined) ?? {}) },
    channels: { ...((rawConfig.channels as Record<string, unknown> | undefined) ?? {}) },
  };

  const plugins = nextConfig.plugins as Record<string, unknown>;
  const channels = nextConfig.channels as Record<string, unknown>;

  const entries = { ...((plugins.entries as Record<string, unknown> | undefined) ?? {}) };
  if (LEGACY_PLUGIN_ID in entries) {
    entries[PLUGIN_ID] = mergeObjects(
      entries[LEGACY_PLUGIN_ID] as Record<string, unknown> | undefined,
      entries[PLUGIN_ID] as Record<string, unknown> | undefined
    );
    delete entries[LEGACY_PLUGIN_ID];
    plugins.entries = entries;
    result.changed.push(
      `config: plugins.entries.${LEGACY_PLUGIN_ID} -> plugins.entries.${PLUGIN_ID}`
    );
  }

  const installs = { ...((plugins.installs as Record<string, unknown> | undefined) ?? {}) };
  if (LEGACY_PLUGIN_ID in installs) {
    installs[PLUGIN_ID] = mergeObjects(
      installs[LEGACY_PLUGIN_ID] as Record<string, unknown> | undefined,
      installs[PLUGIN_ID] as Record<string, unknown> | undefined
    );
    delete installs[LEGACY_PLUGIN_ID];
    plugins.installs = installs;
    result.changed.push(
      `config: plugins.installs.${LEGACY_PLUGIN_ID} -> plugins.installs.${PLUGIN_ID}`
    );
  }

  for (const key of ["allow", "deny"] as const) {
    const values = dedupeStrings(plugins[key] as unknown[] | undefined);
    if (!values?.includes(LEGACY_PLUGIN_ID)) {
      continue;
    }
    const migrated = dedupeStrings(
      values.map((value) => (value === LEGACY_PLUGIN_ID ? PLUGIN_ID : value))
    );
    plugins[key] = migrated;
    result.changed.push(
      `config: plugins.${key} replaced "${LEGACY_PLUGIN_ID}" with "${PLUGIN_ID}"`
    );
  }

  if (LEGACY_CHANNEL_ID in channels) {
    channels[CHANNEL_ID] = mergeObjects(
      channels[LEGACY_CHANNEL_ID] as Record<string, unknown> | undefined,
      channels[CHANNEL_ID] as Record<string, unknown> | undefined
    );
    delete channels[LEGACY_CHANNEL_ID];
    result.changed.push(`config: channels.${LEGACY_CHANNEL_ID} -> channels.${CHANNEL_ID}`);
  }

  if (CHANNEL_ID in channels) {
    channels[CHANNEL_ID] = sanitizeSimplexChannelConfig(channels[CHANNEL_ID], result);
  }

  return { nextConfig, result };
}

export async function migrateStateFiles(
  api: SimplexMigrationStateApi,
  dryRun: boolean
): Promise<MigrationResult> {
  const result: MigrationResult = { changed: [], skipped: [] };
  const credentialsDir = path.join(api.runtime.state.resolveStateDir(), "credentials");
  await mkdir(credentialsDir, { recursive: true });
  const entries = await readdir(credentialsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const source = entry.name;
    let target: string | null = null;
    if (source === `${LEGACY_CHANNEL_ID}-pairing.json`) {
      target = `${CHANNEL_ID}-pairing.json`;
    } else if (source === `${LEGACY_CHANNEL_ID}-allowFrom.json`) {
      target = `${CHANNEL_ID}-allowFrom.json`;
    } else {
      const accountMatch = source.match(/^simplex-(.+)-allowFrom\.json$/);
      if (accountMatch?.[1]) {
        target = `${CHANNEL_ID}-${accountMatch[1]}-allowFrom.json`;
      }
    }
    if (!target) {
      continue;
    }
    const sourcePath = path.join(credentialsDir, source);
    const targetPath = path.join(credentialsDir, target);
    try {
      await access(targetPath);
      result.skipped.push(`state: skipped ${source} because ${target} already exists`);
      continue;
    } catch {}
    if (!dryRun) {
      await rename(sourcePath, targetPath);
    }
    result.changed.push(`state: ${source} -> ${target}`);
  }

  return result;
}

function printMigrationResult(result: MigrationResult, dryRun: boolean): void {
  const title = dryRun
    ? "OpenClaw SimpleX migration dry run"
    : "OpenClaw SimpleX migration complete";
  console.log(title);
  if (result.changed.length === 0) {
    console.log("- No changes were needed.");
  } else {
    for (const line of result.changed) {
      console.log(`- ${line}`);
    }
  }
  for (const line of result.skipped) {
    console.log(`- ${line}`);
  }
}

export async function runMigration(api: OpenClawPluginApi, dryRun: boolean): Promise<void> {
  const currentConfig = api.runtime.config.loadConfig() as Record<string, unknown>;
  const { nextConfig, result: configResult } = migrateConfigObject(currentConfig);
  const stateResult = await migrateStateFiles(api, dryRun);
  const result: MigrationResult = {
    changed: [...configResult.changed, ...stateResult.changed],
    skipped: [...configResult.skipped, ...stateResult.skipped],
  };
  if (!dryRun && configResult.changed.length > 0) {
    await api.runtime.config.writeConfigFile(nextConfig);
  }
  printMigrationResult(result, dryRun);
}
