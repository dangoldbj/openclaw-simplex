import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import { parseSimplexAllowlistEntry } from "./simplex-security.js";

function normalizeHeartbeatRecipient(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("@") || trimmed.startsWith("#")) {
    return trimmed;
  }
  return `@${trimmed}`;
}

function collectHeartbeatRecipients(entries: Array<string | number> | undefined): string[] {
  const recipients = new Set<string>();
  for (const raw of entries ?? []) {
    const parsed = parseSimplexAllowlistEntry(raw);
    if (!parsed || parsed.kind === "any") {
      continue;
    }
    recipients.add(parsed.kind === "group" ? `#${parsed.value}` : `@${parsed.value}`);
  }
  return [...recipients];
}

export function buildSimplexHeartbeat(
  registry: SimplexClientRegistry
): NonNullable<ChannelPlugin["heartbeat"]> {
  return {
    checkReady: async ({ cfg, accountId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      if (!account.enabled) {
        return { ok: false as const, reason: "simplex-disabled" as const };
      }
      if (!account.configured) {
        return { ok: false as const, reason: "simplex-not-configured" as const };
      }
      if (!registry.has(account.accountId)) {
        return { ok: false as const, reason: "simplex-not-running" as const };
      }
      return { ok: true as const, reason: "ok" as const };
    },
    resolveRecipients: ({ cfg, opts }) => {
      if (opts?.to?.trim()) {
        return {
          recipients: [normalizeHeartbeatRecipient(opts.to)],
          source: "flag",
        };
      }

      const account = resolveSimplexAccount({ cfg, accountId: opts?.accountId });
      const dmRecipients = collectHeartbeatRecipients(account.config.allowFrom);
      const groupRecipients = collectHeartbeatRecipients(account.config.groupAllowFrom);

      if (opts?.all) {
        return {
          recipients: [...new Set([...dmRecipients, ...groupRecipients])],
          source: "all",
        };
      }

      return {
        recipients: dmRecipients.length > 0 ? dmRecipients : groupRecipients,
        source: dmRecipients.length > 0 ? "allowFrom" : "groupAllowFrom",
      };
    },
  };
}
