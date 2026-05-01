import { access, mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { renderQrTerminal } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  LEGACY_SIMPLEX_CHANNEL_ID,
  LEGACY_SIMPLEX_PLUGIN_ID,
  SIMPLEX_CHANNEL_ID,
  SIMPLEX_PLUGIN_ID,
} from "../constants.js";
import { connectSimplexLink, planSimplexConnectionLink } from "../simplex/simplex-connect-link.js";
import {
  acceptSimplexContactRequest,
  listSimplexContactRequests,
  rejectSimplexContactRequest,
} from "../simplex/simplex-contact-requests.js";
import {
  createSimplexGroup,
  createSimplexGroupLink,
  listSimplexGroupLink,
  revokeSimplexGroupLink,
} from "../simplex/simplex-groups.js";
import {
  createSimplexInvite,
  listSimplexInvites,
  revokeSimplexInvite,
} from "../simplex/simplex-invite-service.js";
import {
  doctorSimplexRuntime,
  getSimplexRuntimeStatus,
} from "../simplex/simplex-runtime-status.js";

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

type InviteCliOptions = {
  accountId?: string;
  qr?: boolean;
};

type AccountCliOptions = {
  accountId?: string;
};

type RequestCliOptions = AccountCliOptions & {
  contactRequestId?: string;
};

type GroupCreateCliOptions = AccountCliOptions & {
  displayName?: string;
  fullName?: string;
  description?: string;
};

type GroupLinkCliOptions = AccountCliOptions & {
  groupId?: string;
  role?: string;
  qr?: boolean;
};

type ConnectCliOptions = AccountCliOptions & {
  link?: string;
};

const NODE_CONNECTION_KEYS = new Set([
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

function readOptionalAccountId(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function printTerminalQr(value: string): Promise<void> {
  const qr = await renderQrTerminal(value, { small: true });
  console.log(qr);
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function readPositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value?.trim() ?? "");
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function readRequiredString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
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
    operation: result.operation,
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
    revoked: result.revoked,
  });
}

async function runRuntimeStatusCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  printJson(
    await getSimplexRuntimeStatus({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
    })
  );
}

async function runRuntimeDoctorCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  printJson(
    await doctorSimplexRuntime({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
    })
  );
}

async function runRequestsListCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  printJson(
    await listSimplexContactRequests({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
    })
  );
}

async function runRequestsAcceptCli(
  api: OpenClawPluginApi,
  opts: RequestCliOptions
): Promise<void> {
  printJson(
    await acceptSimplexContactRequest({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      contactRequestId: readPositiveInteger(opts.contactRequestId, "contactRequestId"),
    })
  );
}

async function runRequestsRejectCli(
  api: OpenClawPluginApi,
  opts: RequestCliOptions
): Promise<void> {
  printJson(
    await rejectSimplexContactRequest({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      contactRequestId: readPositiveInteger(opts.contactRequestId, "contactRequestId"),
    })
  );
}

async function runGroupCreateCli(
  api: OpenClawPluginApi,
  opts: GroupCreateCliOptions
): Promise<void> {
  printJson(
    await createSimplexGroup({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      displayName: readRequiredString(opts.displayName, "displayName"),
      fullName: opts.fullName,
      description: opts.description,
    })
  );
}

async function runGroupLinkCreateCli(
  api: OpenClawPluginApi,
  opts: GroupLinkCliOptions
): Promise<void> {
  const result = await createSimplexGroupLink({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    groupId: readPositiveInteger(opts.groupId, "groupId"),
    role: opts.role,
  });
  printJson(result);
  if (opts.qr && result.link) {
    await printTerminalQr(result.link);
  }
}

async function runGroupLinkListCli(
  api: OpenClawPluginApi,
  opts: GroupLinkCliOptions
): Promise<void> {
  const result = await listSimplexGroupLink({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    groupId: readPositiveInteger(opts.groupId, "groupId"),
  });
  printJson(result);
  if (opts.qr && result.link) {
    await printTerminalQr(result.link);
  }
}

async function runGroupLinkRevokeCli(
  api: OpenClawPluginApi,
  opts: GroupLinkCliOptions
): Promise<void> {
  printJson(
    await revokeSimplexGroupLink({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      groupId: readPositiveInteger(opts.groupId, "groupId"),
    })
  );
}

async function runConnectPlanCli(api: OpenClawPluginApi, opts: ConnectCliOptions): Promise<void> {
  printJson(
    await planSimplexConnectionLink({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      link: readRequiredString(opts.link, "link"),
    })
  );
}

async function runConnectCli(api: OpenClawPluginApi, opts: ConnectCliOptions): Promise<void> {
  printJson(
    await connectSimplexLink({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      link: readRequiredString(opts.link, "link"),
    })
  );
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

function sanitizeConnectionConfig(
  value: unknown,
  pathLabel: string,
  result: MigrationResult
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    result.changed.push(`config: reset invalid ${pathLabel} to Node runtime connection config`);
    return {};
  }

  const connection = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  const removed: string[] = [];

  for (const [key, fieldValue] of Object.entries(connection)) {
    if (NODE_CONNECTION_KEYS.has(key)) {
      next[key] = fieldValue;
    } else {
      removed.push(key);
    }
  }

  if (removed.length > 0) {
    result.changed.push(
      `config: removed legacy runtime field(s) from ${pathLabel}: ${removed.toSorted().join(", ")}`
    );
  }

  return next;
}

function sanitizeSimplexAccountConfig(
  value: unknown,
  pathLabel: string,
  result: MigrationResult
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
    account.connection = sanitizeConnectionConfig(
      account.connection,
      `${pathLabel}.connection`,
      result
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
        result
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

      const runtime = command.command("runtime").description("SimpleX runtime diagnostics");

      runtime
        .command("status")
        .description("Show SimpleX runtime status for an account")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: AccountCliOptions) => {
          await runRuntimeStatusCli(api, opts);
        });

      runtime
        .command("doctor")
        .description("Run SimpleX runtime diagnostics for an account")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: AccountCliOptions) => {
          await runRuntimeDoctorCli(api, opts);
        });

      const requests = command.command("requests").description("SimpleX contact request helpers");

      requests
        .command("list")
        .description("List pending SimpleX contact requests seen by the runtime")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: AccountCliOptions) => {
          await runRequestsListCli(api, opts);
        });

      requests
        .command("accept")
        .description("Accept a pending SimpleX contact request")
        .requiredOption("--contact-request-id <id>", "SimpleX contact request id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: RequestCliOptions) => {
          await runRequestsAcceptCli(api, opts);
        });

      requests
        .command("reject")
        .description("Reject a pending SimpleX contact request")
        .requiredOption("--contact-request-id <id>", "SimpleX contact request id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: RequestCliOptions) => {
          await runRequestsRejectCli(api, opts);
        });

      const groups = command.command("groups").description("SimpleX group helpers");

      groups
        .command("create")
        .description("Create a SimpleX group")
        .requiredOption("--display-name <name>", "SimpleX group display name")
        .option("--full-name <name>", "SimpleX group full name")
        .option("--description <text>", "SimpleX group description")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: GroupCreateCliOptions) => {
          await runGroupCreateCli(api, opts);
        });

      const groupLink = groups.command("link").description("SimpleX group link helpers");

      groupLink
        .command("create")
        .description("Create a SimpleX group invite link")
        .requiredOption("--group-id <id>", "SimpleX group id")
        .option("--role <role>", "Accepted member role for the group link", "member")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .option("--qr", "Print a terminal QR code for the group link", false)
        .action(async (opts: GroupLinkCliOptions) => {
          await runGroupLinkCreateCli(api, opts);
        });

      groupLink
        .command("list")
        .description("Show the current SimpleX group invite link")
        .requiredOption("--group-id <id>", "SimpleX group id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .option("--qr", "Print a terminal QR code for the group link", false)
        .action(async (opts: GroupLinkCliOptions) => {
          await runGroupLinkListCli(api, opts);
        });

      groupLink
        .command("revoke")
        .description("Revoke the current SimpleX group invite link")
        .requiredOption("--group-id <id>", "SimpleX group id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: GroupLinkCliOptions) => {
          await runGroupLinkRevokeCli(api, opts);
        });

      const connect = command.command("connect").description("SimpleX link onboarding helpers");

      connect
        .command("plan")
        .description("Inspect what connecting to a SimpleX link would do")
        .requiredOption("--link <link>", "SimpleX contact, address, or group link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: ConnectCliOptions) => {
          await runConnectPlanCli(api, opts);
        });

      connect
        .command("run")
        .description("Connect the active SimpleX user to a contact, address, or group link")
        .requiredOption("--link <link>", "SimpleX contact, address, or group link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: ConnectCliOptions) => {
          await runConnectCli(api, opts);
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
