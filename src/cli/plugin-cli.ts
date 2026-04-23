import { access, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { toString as toQrString } from "qrcode";
import {
  LEGACY_SIMPLEX_CHANNEL_ID,
  LEGACY_SIMPLEX_PLUGIN_ID,
  SIMPLEX_CHANNEL_ID,
  SIMPLEX_PLUGIN_ID,
} from "../constants.js";
import {
  createSimplexInvite,
  listSimplexInvites,
  revokeSimplexInvite,
} from "../simplex/simplex-invite-service.js";

export const LEGACY_PLUGIN_ID = LEGACY_SIMPLEX_PLUGIN_ID;
export const PLUGIN_ID = SIMPLEX_PLUGIN_ID;
export const LEGACY_CHANNEL_ID = LEGACY_SIMPLEX_CHANNEL_ID;
export const CHANNEL_ID = SIMPLEX_CHANNEL_ID;

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

type InviteCliOptions = {
  accountId?: string;
  qr?: boolean;
};

function readOptionalAccountId(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function printTerminalQr(value: string): Promise<void> {
  const qr = await toQrString(value, { type: "terminal", small: true, margin: 1 });
  console.log(qr);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function runInviteCreateCli(
  api: OpenClawPluginApi,
  mode: "connect" | "address",
  opts: InviteCliOptions
): Promise<void> {
  const result = await createSimplexInvite({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    mode,
    logger: api.logger,
  });
  printJson({
    accountId: result.accountId,
    mode: result.mode,
    command: result.command,
    link: result.link,
  });
  if (opts.qr && result.link) {
    await printTerminalQr(result.link);
  }
}

async function runInviteListCli(api: OpenClawPluginApi, opts: InviteCliOptions): Promise<void> {
  const result = await listSimplexInvites({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    logger: api.logger,
  });
  printJson({
    accountId: result.accountId,
    addressLink: result.addressLink,
    links: result.links,
    pendingHints: result.pendingHints,
  });
  if (opts.qr && result.addressLink) {
    await printTerminalQr(result.addressLink);
  }
}

async function runAddressShowCli(api: OpenClawPluginApi, opts: InviteCliOptions): Promise<void> {
  const result = await listSimplexInvites({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    logger: api.logger,
  });
  printJson({
    accountId: result.accountId,
    addressLink: result.addressLink,
    pendingHints: result.pendingHints,
  });
  if (opts.qr && result.addressLink) {
    await printTerminalQr(result.addressLink);
  }
}

async function runAddressRevokeCli(api: OpenClawPluginApi, opts: InviteCliOptions): Promise<void> {
  const result = await revokeSimplexInvite({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    logger: api.logger,
  });
  printJson({
    accountId: result.accountId,
    revoked: true,
  });
}

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

const SIMPLEX_CLI_COMMANDS = [PLUGIN_ID, LEGACY_PLUGIN_ID];

const SIMPLEX_CLI_DESCRIPTORS = [
  {
    name: PLUGIN_ID,
    description: "OpenClaw SimpleX plugin commands",
    hasSubcommands: true,
  },
  {
    name: LEGACY_PLUGIN_ID,
    description: "OpenClaw SimpleX plugin commands",
    hasSubcommands: true,
  },
] as const;

export function registerSimplexCliMetadata(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program }) => {
      const command = program
        .command(PLUGIN_ID)
        .alias(LEGACY_PLUGIN_ID)
        .description("OpenClaw SimpleX plugin commands");

      command
        .command("migrate")
        .description("Migrate config and OpenClaw state from simplex -> openclaw-simplex ids")
        .option("--dry-run", "Show planned changes without writing files", false)
        .action(async (opts: { dryRun?: boolean }) => {
          await runMigration(api, opts.dryRun === true);
        });

      const invite = command.command("invite").description("SimpleX invite helpers");

      invite
        .command("create")
        .description("Create a one-time invite link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .option("--qr", "Print a terminal QR code for the generated link", false)
        .action(async (opts: InviteCliOptions) => {
          await runInviteCreateCli(api, "connect", opts);
        });

      invite
        .command("list")
        .description("List current invite and address link state")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .option("--qr", "Print a terminal QR code for the current address link", false)
        .action(async (opts: InviteCliOptions) => {
          await runInviteListCli(api, opts);
        });

      const address = command.command("address").description("SimpleX address helpers");

      address
        .command("show")
        .description("Show the current address link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .option("--qr", "Print a terminal QR code for the current address link", false)
        .action(async (opts: InviteCliOptions) => {
          await runAddressShowCli(api, opts);
        });

      address
        .command("create")
        .description("Create or return the current address link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .option("--qr", "Print a terminal QR code for the address link", false)
        .action(async (opts: InviteCliOptions) => {
          await runInviteCreateCli(api, "address", opts);
        });

      address
        .command("revoke")
        .description("Revoke the current address link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: InviteCliOptions) => {
          await runAddressRevokeCli(api, opts);
        });
    },
    {
      commands: [...SIMPLEX_CLI_COMMANDS],
      descriptors: [...SIMPLEX_CLI_DESCRIPTORS],
    }
  );
}

export function registerSimplexCli(api: OpenClawPluginApi): void {
  registerSimplexCliMetadata(api);
}
