import { renderQrTerminal } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { LEGACY_SIMPLEX_PLUGIN_ID, SIMPLEX_PLUGIN_ID } from "../constants.js";
import {
  connectSimplexLink,
  planSimplexConnectionLink,
} from "../simplex/services/connect-links.js";
import {
  acceptSimplexContactRequest,
  listSimplexContactRequests,
  rejectSimplexContactRequest,
} from "../simplex/services/contact-requests.js";
import {
  createSimplexGroup,
  createSimplexGroupLink,
  listSimplexGroupLink,
  revokeSimplexGroupLink,
} from "../simplex/services/groups.js";
import {
  createSimplexInvite,
  listSimplexInvites,
  revokeSimplexInvite,
} from "../simplex/services/invites.js";
import {
  doctorSimplexRuntime,
  getSimplexRuntimeStatus,
} from "../simplex/services/runtime-status.js";
import { runMigration } from "./migration.js";

export { migrateConfigObject, migrateStateFiles } from "./migration.js";

const LEGACY_PLUGIN_ID = LEGACY_SIMPLEX_PLUGIN_ID;
const PLUGIN_ID = SIMPLEX_PLUGIN_ID;

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
