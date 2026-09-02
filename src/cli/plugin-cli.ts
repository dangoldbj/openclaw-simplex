import { renderQrTerminal } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  DEFAULT_SIMPLEX_FILES_FOLDER,
  DEFAULT_SIMPLEX_TEMP_FOLDER,
  LEGACY_SIMPLEX_PLUGIN_ID,
  SIMPLEX_PLUGIN_ID,
} from "../constants.js";
import { readRequiredPositiveInteger } from "../params.js";
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
  blockSimplexGroupMember,
  cancelSimplexFile,
  checkSimplexContactVerification,
  deleteSimplexGroupMemberMessages,
  listSimplexRuntimeUsers,
  receiveSimplexFile,
  showSimplexContactVerification,
  showSimplexRuntimeActiveUser,
} from "../simplex/services/runtime-operations.js";
import {
  doctorSimplexRuntime,
  getSimplexRuntimeStatus,
} from "../simplex/services/runtime-status.js";
import { runMigration } from "./migration.js";
import { emit, formatRuntimeDoctor, type OutputCliOptions } from "./output.js";
import { type RuntimeServiceOptions, runRuntimeServiceInstallCli } from "./runtime-service.js";

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

type RuntimeServiceCliOptions = RuntimeServiceOptions;

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

type ContactVerificationCliOptions = AccountCliOptions & {
  contactId?: string;
  code?: string;
};

type GroupMemberCliOptions = AccountCliOptions & {
  groupId?: string;
  memberId?: string;
};

type FileCliOptions = AccountCliOptions & {
  fileId?: string;
};

function readOptionalAccountId(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function printTerminalQr(value: string): Promise<void> {
  const qr = await renderQrTerminal(value, { small: true });
  console.log(qr);
}

/**
 * Output mode for the command currently executing. A CLI process runs exactly
 * one command, and a `preAction` hook sets this before any action body runs, so
 * a single module-level value is sufficient and keeps every call site from
 * having to thread options through purely for formatting.
 */
let outputOpts: OutputCliOptions = {};

function printResult<T>(value: T, formatter?: (value: T) => string): void {
  emit(value, outputOpts, formatter);
}

function requireOptionValue(value: string | undefined, label: string): string {
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
  printResult({
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
  printResult({
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
  printResult({
    accountId: result.accountId,
    addressLink: result.addressLink,
    pendingHints: result.pendingHints,
  });
  if (opts.qr && result.addressLink) {
    await printTerminalQr(result.addressLink);
  }
}

async function runInviteRevokeCli(api: OpenClawPluginApi, opts: InviteCliOptions): Promise<void> {
  const result = await revokeSimplexInvite({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
    logger: api.logger,
  });
  printResult({
    accountId: result.accountId,
    revoked: result.revoked,
  });
}

async function runRuntimeStatusCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  printResult(
    await getSimplexRuntimeStatus({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
    })
  );
}

async function runRuntimeDoctorCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  const result = await doctorSimplexRuntime({
    cfg: api.config,
    accountId: readOptionalAccountId(opts.accountId),
  });
  printResult(result, formatRuntimeDoctor);
  if (!result.ok) {
    // The doctor previously reported problems and still exited 0, so it could
    // not gate anything. `exitCode` rather than `exit()` so stdout still flushes.
    process.exitCode = 1;
  }
}

async function runRuntimeUsersCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  printResult(
    await listSimplexRuntimeUsers({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
    })
  );
}

async function runRuntimeActiveUserCli(
  api: OpenClawPluginApi,
  opts: AccountCliOptions
): Promise<void> {
  printResult(
    await showSimplexRuntimeActiveUser({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
    })
  );
}

async function runVerificationShowCli(
  api: OpenClawPluginApi,
  opts: ContactVerificationCliOptions
): Promise<void> {
  printResult(
    await showSimplexContactVerification({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      contactId: readRequiredPositiveInteger(opts, "contactId"),
    })
  );
}

async function runVerificationCheckCli(
  api: OpenClawPluginApi,
  opts: ContactVerificationCliOptions
): Promise<void> {
  printResult(
    await checkSimplexContactVerification({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      contactId: readRequiredPositiveInteger(opts, "contactId"),
      code: opts.code,
    })
  );
}

async function runRequestsListCli(api: OpenClawPluginApi, opts: AccountCliOptions): Promise<void> {
  printResult(
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
  printResult(
    await acceptSimplexContactRequest({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      contactRequestId: readRequiredPositiveInteger(opts, "contactRequestId"),
    })
  );
}

async function runRequestsRejectCli(
  api: OpenClawPluginApi,
  opts: RequestCliOptions
): Promise<void> {
  printResult(
    await rejectSimplexContactRequest({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      contactRequestId: readRequiredPositiveInteger(opts, "contactRequestId"),
    })
  );
}

async function runGroupCreateCli(
  api: OpenClawPluginApi,
  opts: GroupCreateCliOptions
): Promise<void> {
  printResult(
    await createSimplexGroup({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      displayName: requireOptionValue(opts.displayName, "displayName"),
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
    groupId: readRequiredPositiveInteger(opts, "groupId"),
    role: opts.role,
  });
  printResult(result);
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
    groupId: readRequiredPositiveInteger(opts, "groupId"),
  });
  printResult(result);
  if (opts.qr && result.link) {
    await printTerminalQr(result.link);
  }
}

async function runGroupLinkRevokeCli(
  api: OpenClawPluginApi,
  opts: GroupLinkCliOptions
): Promise<void> {
  printResult(
    await revokeSimplexGroupLink({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      groupId: readRequiredPositiveInteger(opts, "groupId"),
    })
  );
}

async function runGroupMemberBlockCli(
  api: OpenClawPluginApi,
  opts: GroupMemberCliOptions
): Promise<void> {
  printResult(
    await blockSimplexGroupMember({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      groupId: readRequiredPositiveInteger(opts, "groupId"),
      memberId: readRequiredPositiveInteger(opts, "memberId"),
    })
  );
}

async function runGroupMemberDeleteMessagesCli(
  api: OpenClawPluginApi,
  opts: GroupMemberCliOptions
): Promise<void> {
  printResult(
    await deleteSimplexGroupMemberMessages({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      groupId: readRequiredPositiveInteger(opts, "groupId"),
      memberId: readRequiredPositiveInteger(opts, "memberId"),
    })
  );
}

async function runFileReceiveCli(api: OpenClawPluginApi, opts: FileCliOptions): Promise<void> {
  printResult(
    await receiveSimplexFile({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      fileId: readRequiredPositiveInteger(opts, "fileId"),
    })
  );
}

async function runFileCancelCli(api: OpenClawPluginApi, opts: FileCliOptions): Promise<void> {
  printResult(
    await cancelSimplexFile({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      fileId: readRequiredPositiveInteger(opts, "fileId"),
    })
  );
}

async function runConnectPlanCli(api: OpenClawPluginApi, opts: ConnectCliOptions): Promise<void> {
  printResult(
    await planSimplexConnectionLink({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      link: requireOptionValue(opts.link, "link"),
    })
  );
}

async function runConnectCli(api: OpenClawPluginApi, opts: ConnectCliOptions): Promise<void> {
  printResult(
    await connectSimplexLink({
      cfg: api.config,
      accountId: readOptionalAccountId(opts.accountId),
      link: requireOptionValue(opts.link, "link"),
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

/**
 * Structural view of the commander `Command` passed to the CLI registrar.
 * Commander is not a direct dependency and the SDK does not re-export its
 * `Command` type, so the shape is declared to match commander's own signatures
 * (`commands` is readonly there, and hook listeners may return a promise).
 */
type CommandLike = {
  readonly commands?: readonly CommandLike[];
  option?: (flags: string, description: string) => unknown;
  opts?: () => Record<string, unknown>;
  hook?: (
    event: "preAction",
    listener: (thisCommand: CommandLike, actionCommand: CommandLike) => void | Promise<void>
  ) => unknown;
};

/**
 * Adds `--json` to every leaf command and captures the resolved options before
 * any action runs, so output formatting does not have to be threaded through
 * each of the ~30 command handlers.
 *
 * Every member is treated as optional. Output formatting is a convenience, and
 * a host that hands over a reduced command object must still get its commands
 * registered rather than an exception during plugin load.
 */
export function applyOutputOptions(root: CommandLike): void {
  const addJsonFlag = (cmd: CommandLike): void => {
    for (const sub of cmd.commands ?? []) {
      // Only leaves execute actions; option groups would just add noise to help.
      if ((sub.commands?.length ?? 0) === 0) {
        sub.option?.("--json", "Print raw JSON instead of a human-readable summary");
      }
      addJsonFlag(sub);
    }
  };
  addJsonFlag(root);

  root.hook?.("preAction", (_thisCommand, actionCommand) => {
    outputOpts = { json: actionCommand.opts?.().json === true };
  });
}

export function registerSimplexCliMetadata(api: OpenClawPluginApi): void {
  api.registerCli(
    ({ program }) => {
      const command = program
        .command(PLUGIN_ID)
        .alias(LEGACY_PLUGIN_ID)
        .description("OpenClaw SimpleX plugin commands");

      command
        .command("migrate")
        .description("Migrate SimpleX ids and legacy WebSocket runtime config")
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

      invite
        .command("revoke")
        .description("Revoke the current address/invite link")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: InviteCliOptions) => {
          await runInviteRevokeCli(api, opts);
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
          await runInviteRevokeCli(api, opts);
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

      runtime
        .command("users")
        .description("List SimpleX runtime users")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: AccountCliOptions) => {
          await runRuntimeUsersCli(api, opts);
        });

      runtime
        .command("active-user")
        .description("Show the active SimpleX runtime user")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: AccountCliOptions) => {
          await runRuntimeActiveUserCli(api, opts);
        });

      const runtimeService = runtime
        .command("service")
        .description("Manage a host service for the external simplex-chat runtime");

      runtimeService
        .command("install")
        .description("Write the service file after interactive approval")
        .option(
          "--provider <provider>",
          "Service manager: auto, systemd, launchd, or sysvinit",
          "auto"
        )
        .option("--port <port>", "simplex-chat WebSocket port", "5225")
        .option("--simplex-chat-path <path>", "Path to simplex-chat", "simplex-chat")
        .option("--device-name <name>", "SimpleX device name", "OpenClaw SimpleX")
        .option("--files-folder <path>", "SimpleX files folder", DEFAULT_SIMPLEX_FILES_FOLDER)
        .option("--temp-folder <path>", "SimpleX temp folder", DEFAULT_SIMPLEX_TEMP_FOLDER)
        .option("--dry-run", "Print the plan without writing files", false)
        .action(async (opts: RuntimeServiceCliOptions) => {
          await runRuntimeServiceInstallCli(opts);
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

      const verification = command
        .command("verification")
        .description("SimpleX contact verification helpers");

      verification
        .command("show")
        .description("Show contact verification metadata when the runtime supports it")
        .requiredOption("--contact-id <id>", "SimpleX contact id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: ContactVerificationCliOptions) => {
          await runVerificationShowCli(api, opts);
        });

      verification
        .command("check")
        .description("Check contact verification metadata when the runtime supports it")
        .requiredOption("--contact-id <id>", "SimpleX contact id")
        .option("--code <code>", "Verification code to check")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: ContactVerificationCliOptions) => {
          await runVerificationCheckCli(api, opts);
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

      const groupMember = groups.command("member").description("SimpleX group moderation helpers");

      groupMember
        .command("block")
        .description("Block or remove a SimpleX group member when the runtime supports it")
        .requiredOption("--group-id <id>", "SimpleX group id")
        .requiredOption("--member-id <id>", "SimpleX group member id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: GroupMemberCliOptions) => {
          await runGroupMemberBlockCli(api, opts);
        });

      groupMember
        .command("delete-messages")
        .description("Remove a member's SimpleX group messages when the runtime supports it")
        .requiredOption("--group-id <id>", "SimpleX group id")
        .requiredOption("--member-id <id>", "SimpleX group member id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: GroupMemberCliOptions) => {
          await runGroupMemberDeleteMessagesCli(api, opts);
        });

      const files = command.command("files").description("SimpleX file transfer helpers");

      files
        .command("receive")
        .description("Receive a pending SimpleX file transfer")
        .requiredOption("--file-id <id>", "SimpleX file id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: FileCliOptions) => {
          await runFileReceiveCli(api, opts);
        });

      files
        .command("cancel")
        .description("Cancel a SimpleX file transfer")
        .requiredOption("--file-id <id>", "SimpleX file id")
        .option("--account-id <accountId>", "Use a specific SimpleX account")
        .action(async (opts: FileCliOptions) => {
          await runFileCancelCli(api, opts);
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

      applyOutputOptions(command);
    },
    {
      commands: [...SIMPLEX_CLI_COMMANDS],
      descriptors: [...SIMPLEX_CLI_DESCRIPTORS],
    }
  );
}
