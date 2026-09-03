import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import type { ChannelDoctorAdapter } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { withTimeout } from "openclaw/plugin-sdk/infra-runtime";
import { LEGACY_SIMPLEX_RUNTIME_KEYS, migrateSimplexConfig } from "../../cli/migration.js";
import { listEnabledSimplexAccounts } from "../../config/accounts.js";
import type { SimplexAccountConfig, SimplexChannelConfig } from "../../config/config-schema.js";
import { LEGACY_SIMPLEX_CHANNEL_ID, SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { describeError } from "../../errors.js";
import { doctorSimplexRuntime } from "../../simplex/services/runtime-status.js";
import { resolveSimplexFilesFolder } from "../events/simplex-inbound-files.js";

/**
 * `openclaw doctor` is interactive, so the live probe is bounded well below the
 * account's own `connectTimeoutMs` (15s by default). A runtime that is simply
 * not running should cost a few seconds, not a stall.
 */
const RUNTIME_PROBE_TIMEOUT_MS = 4000;

/** Escape hatch for CI and offline config audits. */
const SKIP_PROBE_ENV = "OPENCLAW_SIMPLEX_DOCTOR_SKIP_RUNTIME_PROBE";

function isProbeDisabled(env: NodeJS.ProcessEnv | undefined): boolean {
  const raw = env?.[SKIP_PROBE_ENV]?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Surfaces the live runtime diagnostics that `doctorSimplexRuntime` already
 * computes. Without this the channel doctor only ever sees static config and
 * stays silent while the runtime is unreachable, which is the failure operators
 * actually hit.
 *
 * Probe failures are reported, never thrown: a down runtime must not abort the
 * rest of `openclaw doctor`.
 */
async function collectRuntimeWarnings(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<string[]> {
  if (isProbeDisabled(params.env)) {
    return [];
  }

  const accounts = listEnabledSimplexAccounts(params.cfg).filter((account) => account.configured);
  if (accounts.length === 0) {
    return [];
  }

  // Probed together so total doctor cost stays near one timeout regardless of
  // how many accounts are configured.
  const perAccount = await Promise.all(
    accounts.map(async (account) => {
      const scope = accounts.length > 1 ? ` for account "${account.accountId}"` : "";
      try {
        const probe = await withTimeout(
          doctorSimplexRuntime({ cfg: params.cfg, accountId: account.accountId }),
          RUNTIME_PROBE_TIMEOUT_MS,
          { message: `did not respond within ${RUNTIME_PROBE_TIMEOUT_MS}ms` }
        );
        return probe.issues.map((issue) => `- ${issue}${scope}`);
      } catch (error) {
        const reason = describeError(error);
        return [
          `- SimpleX runtime at ${account.wsUrl}${scope} is unavailable: ${reason}. Start the simplex-chat runtime, or set ${SKIP_PROBE_ENV}=1 to skip this probe.`,
        ];
      }
    })
  );
  return perAccount.flat();
}

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

type FilesFolderTarget = { folder: string; label: string };

function collectFilesFolderTargets(channel: SimplexChannelConfig): FilesFolderTarget[] {
  const targets: FilesFolderTarget[] = [];
  const seen = new Set<string>();
  const add = (configured: string | undefined, scope: string) => {
    const folder = resolveSimplexFilesFolder(configured);
    if (seen.has(folder)) {
      return;
    }
    seen.add(folder);
    const source = configured ? "connection.filesFolder" : "the default SimpleX files folder";
    targets.push({ folder, label: `${source} (${folder})${scope}` });
  };

  add(channel.connection?.filesFolder?.trim(), "");
  for (const [accountId, account] of Object.entries(channel.accounts ?? {})) {
    const override = account?.connection?.filesFolder?.trim();
    if (override) {
      add(override, ` for account "${accountId}"`);
    }
  }
  return targets;
}

// A missing/unwritable files folder makes file transfers fail silently
// (simplex-chat with -p logs nothing), so surface it as a diagnostic.
async function collectFilesFolderWarning(target: FilesFolderTarget): Promise<string | undefined> {
  try {
    const info = await stat(target.folder);
    if (!info.isDirectory()) {
      return `- SimpleX ${target.label} exists but is not a directory. Received files cannot be read until it is a writable directory.`;
    }
  } catch {
    return `- SimpleX ${target.label} does not exist. Received files will be dropped until it is created (the runtime's --files-folder).`;
  }
  try {
    await access(target.folder, fsConstants.W_OK);
  } catch {
    return `- SimpleX ${target.label} is not writable. Received files will be dropped until its permissions are fixed.`;
  }
  return undefined;
}

function readChannelConfig(cfg: { channels?: Record<string, unknown> }): SimplexChannelConfig {
  return (cfg.channels?.[SIMPLEX_CHANNEL_ID] ?? {}) as SimplexChannelConfig;
}

function collectAccountWarnings(
  channel: SimplexChannelConfig,
  accountId: string,
  account: SimplexAccountConfig
): string[] {
  const warnings: string[] = [];

  const inheritedAllowFrom = account.allowFrom ?? channel.allowFrom;
  if (account.dmPolicy === "allowlist" && isEmptyArray(inheritedAllowFrom)) {
    warnings.push(
      `- SimpleX account "${accountId}" has dmPolicy="allowlist" with an empty allowFrom list. Add trusted SimpleX contact ids or switch to pairing.`
    );
  }

  const inheritedGroupAllowFrom = account.groupAllowFrom ?? channel.groupAllowFrom;
  if (account.groupPolicy === "allowlist" && isEmptyArray(inheritedGroupAllowFrom)) {
    warnings.push(
      `- SimpleX account "${accountId}" has groupPolicy="allowlist" with an empty groupAllowFrom list. Add trusted SimpleX group/member ids before enabling group access.`
    );
  }
  return warnings;
}

/**
 * Reported by `openclaw doctor` and repaired by its fix command. The rules only
 * load while `channels.openclaw-simplex` is configured, which is why the same
 * migration is also registered as a setup-time config migration: a config that
 * still uses only the legacy ids never resolves to this plugin at all.
 */
const legacyConfigRules = [
  {
    path: ["channels", LEGACY_SIMPLEX_CHANNEL_ID],
    message: `channels.${LEGACY_SIMPLEX_CHANNEL_ID} was renamed to channels.${SIMPLEX_CHANNEL_ID} in 1.0.0.`,
  },
  ...[...LEGACY_SIMPLEX_RUNTIME_KEYS].toSorted().map((key) => ({
    path: ["channels", SIMPLEX_CHANNEL_ID, key],
    message: `channels.${SIMPLEX_CHANNEL_ID}.${key} is a pre-1.0 managed-runtime field. The external runtime is configured under connection.*.`,
  })),
];

export const simplexDoctor: ChannelDoctorAdapter = {
  groupModel: "sender",
  dmAllowFromMode: "topOrNested",
  warnOnEmptyGroupSenderAllowlist: true,
  legacyConfigRules,
  repairConfig: ({ cfg }) => {
    const migrated = migrateSimplexConfig(cfg);
    if (!migrated) {
      return { config: cfg, changes: [] };
    }
    return {
      ...migrated,
      // Credential files are renamed by `migrateStateFiles`, which needs async
      // fs and so stays on the CLI. Repairing config alone would otherwise
      // leave pairing and allowlist state orphaned under its old name.
      warnings: [
        `- SimpleX credential files may still use legacy names. Run openclaw simplex migrate to rename them.`,
      ],
    };
  },
  collectPreviewWarnings: async ({ cfg, doctorFixCommand, env }) => {
    const warnings: string[] = [];
    const legacy = cfg.channels?.[LEGACY_SIMPLEX_CHANNEL_ID];
    if (legacy) {
      warnings.push(
        `- Legacy channels.${LEGACY_SIMPLEX_CHANNEL_ID} config is present. Run openclaw-simplex migrate or ${doctorFixCommand} before relying on ${SIMPLEX_CHANNEL_ID}.`
      );
    }

    const channel = readChannelConfig(cfg);
    if (channel.dmPolicy === "allowlist" && isEmptyArray(channel.allowFrom)) {
      warnings.push(
        '- SimpleX dmPolicy="allowlist" is configured with an empty allowFrom list. New contacts will be dropped until allowFrom is populated.'
      );
    }

    if (channel.groupPolicy === "allowlist" && isEmptyArray(channel.groupAllowFrom)) {
      warnings.push(
        '- SimpleX groupPolicy="allowlist" is configured with an empty groupAllowFrom list. Group messages will be dropped until groupAllowFrom is populated.'
      );
    }

    for (const [accountId, account] of Object.entries(channel.accounts ?? {})) {
      if (!account) {
        continue;
      }
      warnings.push(...collectAccountWarnings(channel, accountId, account));
    }

    for (const target of collectFilesFolderTargets(channel)) {
      const warning = await collectFilesFolderWarning(target);
      if (warning) {
        warnings.push(warning);
      }
    }

    warnings.push(...(await collectRuntimeWarnings({ cfg, env })));

    return warnings;
  },
};
