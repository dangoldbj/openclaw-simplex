import type { ChannelDoctorAdapter } from "openclaw/plugin-sdk/channel-contract";
import type { SimplexAccountConfig, SimplexChannelConfig } from "../config/config-schema.js";
import { LEGACY_SIMPLEX_CHANNEL_ID, SIMPLEX_CHANNEL_ID } from "../constants.js";

function isEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

function readChannelConfig(cfg: { channels?: Record<string, unknown> }): SimplexChannelConfig {
  return (cfg.channels?.[SIMPLEX_CHANNEL_ID] ?? {}) as SimplexChannelConfig;
}

function collectAccountWarnings(
  channel: SimplexChannelConfig,
  accountId: string,
  account: SimplexAccountConfig,
  doctorFixCommand: string
): string[] {
  const warnings: string[] = [];
  const wsUrl = account.connection?.wsUrl ?? "";
  if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
    warnings.push(
      `- SimpleX account "${accountId}" has connection.wsUrl="${wsUrl}". Use ws:// or wss://, then run ${doctorFixCommand}.`
    );
  }

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
  collectPreviewWarnings: ({ cfg, doctorFixCommand }) => {
    const warnings: string[] = [];
    const legacy = cfg.channels?.[LEGACY_SIMPLEX_CHANNEL_ID];
    if (legacy) {
      warnings.push(
        `- Legacy channels.${LEGACY_SIMPLEX_CHANNEL_ID} config is present. Run openclaw-simplex migrate or ${doctorFixCommand} before relying on ${SIMPLEX_CHANNEL_ID}.`
      );
    }

    const channel = readChannelConfig(cfg);
    const baseWsUrl = typeof channel.connection?.wsUrl === "string" ? channel.connection.wsUrl : "";
    if (baseWsUrl && !/^wss?:\/\//i.test(baseWsUrl)) {
      warnings.push(`- SimpleX connection.wsUrl="${baseWsUrl}" must start with ws:// or wss://.`);
    }

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
      warnings.push(...collectAccountWarnings(channel, accountId, account, doctorFixCommand));
    }

    return warnings;
  },
};
