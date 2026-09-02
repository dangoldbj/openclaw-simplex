import { constants as fsConstants } from "node:fs";
import { access, stat } from "node:fs/promises";
import type { ChannelDoctorAdapter } from "openclaw/plugin-sdk/channel-contract";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { listEnabledSimplexAccounts } from "../../config/accounts.js";
import type { SimplexAccountConfig, SimplexChannelConfig } from "../../config/config-schema.js";
import { LEGACY_SIMPLEX_CHANNEL_ID, SIMPLEX_CHANNEL_ID } from "../../constants.js";
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

async function withTimeout<T>(
  run: () => Promise<T>,
  timeoutMs: number
): Promise<{ ok: true; value: T } | { ok: false; timedOut: boolean; error?: unknown }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
    timer.unref?.();
  });
  try {
    const result = await Promise.race([run().then((value) => ({ value })), timeout]);
    if (result === "timeout") {
      return { ok: false, timedOut: true };
    }
    return { ok: true, value: result.value };
  } catch (error) {
    return { ok: false, timedOut: false, error };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      const probe = await withTimeout(
        () => doctorSimplexRuntime({ cfg: params.cfg, accountId: account.accountId }),
        RUNTIME_PROBE_TIMEOUT_MS
      );

      if (!probe.ok) {
        const reason = probe.timedOut
          ? `did not respond within ${RUNTIME_PROBE_TIMEOUT_MS}ms`
          : `is unreachable (${describeError(probe.error)})`;
        return [
          `- SimpleX runtime at ${account.wsUrl}${scope} ${reason}. Start the simplex-chat runtime, or set ${SKIP_PROBE_ENV}=1 to skip this probe.`,
        ];
      }

      return probe.value.issues.map((issue) => `- ${issue}${scope}`);
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

export const simplexDoctor: ChannelDoctorAdapter = {
  groupModel: "sender",
  dmAllowFromMode: "topOrNested",
  warnOnEmptyGroupSenderAllowlist: true,
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
