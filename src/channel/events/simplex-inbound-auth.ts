import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveInboundMentionDecision } from "openclaw/plugin-sdk/channel-inbound";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatContext } from "../../types/events.js";
import type { getSimplexRuntime } from "../runtime.js";
import { isSimplexAllowlisted } from "../security/simplex-security.js";

type SimplexRuntimeCore = ReturnType<typeof getSimplexRuntime>;

export type SimplexInboundAccessResult = {
  allowed: boolean;
  commandAuthorized?: boolean;
  effectiveWasMentioned?: boolean;
};

function resolveSimplexGroupRequireMention(params: {
  account: ResolvedSimplexAccount;
  groupId?: number | null;
}): boolean {
  const groupId = params.groupId ? String(params.groupId) : undefined;
  const groups = params.account.config.groups ?? {};
  const entry = groupId ? groups[groupId] : undefined;
  const fallback = groups["*"];
  if (typeof entry?.requireMention === "boolean") {
    return entry.requireMention;
  }
  if (typeof fallback?.requireMention === "boolean") {
    return fallback.requireMention;
  }
  return true;
}

export async function resolveSimplexInboundAccess(params: {
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
  runtime: RuntimeEnv;
  core: SimplexRuntimeCore;
  context: SimplexChatContext;
  rawBody: string;
  normalizedSenderId?: string;
  routeAgentId: string;
  replyToPairingRequest: (text: string) => Promise<void>;
}): Promise<SimplexInboundAccessResult> {
  const { account, cfg, runtime, core, context, rawBody, normalizedSenderId } = params;
  const isGroup = context.chatType === "group";
  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
  const configAllowFrom = (account.config.allowFrom ?? []).map((entry) => String(entry));
  const configGroupAllowFrom = (account.config.groupAllowFrom ?? []).map((entry) => String(entry));
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, cfg);
  const shouldLoadAllowFromStore =
    (!isGroup && (dmPolicy !== "open" || shouldComputeAuth)) ||
    (isGroup && (groupPolicy !== "open" || shouldComputeAuth));
  const storeAllowFrom = shouldLoadAllowFromStore
    ? await core.channel.pairing
        .readAllowFromStore({
          channel: SIMPLEX_CHANNEL_ID,
          accountId: account.accountId,
        })
        .catch(() => [])
    : [];
  const effectiveDmAllowFrom = [...configAllowFrom, ...storeAllowFrom];
  const baseGroupAllowFrom =
    configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom;
  const effectiveGroupAllowFrom = [...baseGroupAllowFrom, ...storeAllowFrom];
  const allowlistForCommands = isGroup ? effectiveGroupAllowFrom : effectiveDmAllowFrom;
  const senderAllowedForCommands = isSimplexAllowlisted({
    allowFrom: allowlistForCommands,
    senderId: normalizedSenderId,
    groupId: String(context.chatId),
    allowGroupId: isGroup,
  });
  const useAccessGroups = cfg.commands?.useAccessGroups !== false;
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          {
            configured: allowlistForCommands.length > 0,
            allowed: senderAllowedForCommands,
          },
        ],
      })
    : undefined;

  if (isGroup) {
    if (groupPolicy === "disabled") {
      runtime.log?.(`[${account.accountId}] SimpleX drop group (groupPolicy=disabled)`);
      return { allowed: false, commandAuthorized };
    }
    if (groupPolicy === "allowlist") {
      if (effectiveGroupAllowFrom.length === 0) {
        runtime.log?.(
          `[${account.accountId}] SimpleX drop group (groupPolicy=allowlist, empty allowlist)`
        );
        return { allowed: false, commandAuthorized };
      }
      const allowed = isSimplexAllowlisted({
        allowFrom: effectiveGroupAllowFrom,
        senderId: normalizedSenderId,
        groupId: String(context.chatId),
        allowGroupId: true,
      });
      if (!allowed) {
        runtime.log?.(
          `[${account.accountId}] SimpleX drop group sender ${context.senderId ?? "unknown"} (not allowlisted)`
        );
        return { allowed: false, commandAuthorized };
      }
    }
  } else if (dmPolicy !== "open") {
    const allowed = isSimplexAllowlisted({
      allowFrom: effectiveDmAllowFrom,
      senderId: normalizedSenderId,
      allowGroupId: false,
    });
    if (!allowed) {
      if (dmPolicy === "pairing") {
        const senderId = normalizedSenderId ?? String(context.chatId);
        const { code, created } = await core.channel.pairing.upsertPairingRequest({
          channel: SIMPLEX_CHANNEL_ID,
          id: senderId,
          accountId: account.accountId,
          meta: { name: context.senderName },
        });
        if (created) {
          runtime.log?.(`[${account.accountId}] SimpleX pairing request sender=${senderId}`);
          try {
            await params.replyToPairingRequest(
              core.channel.pairing.buildPairingReply({
                channel: SIMPLEX_CHANNEL_ID,
                idLine: `Your SimpleX contact id: ${senderId}`,
                code,
              })
            );
          } catch (err) {
            runtime.error?.(`[${account.accountId}] SimpleX pairing reply failed: ${String(err)}`);
          }
        }
      } else {
        runtime.log?.(
          `[${account.accountId}] SimpleX drop DM from ${context.senderId ?? "unknown"} (dmPolicy=${dmPolicy})`
        );
      }
      return { allowed: false, commandAuthorized };
    }
  }

  let effectiveWasMentioned: boolean | undefined;
  if (isGroup) {
    const requireMention = resolveSimplexGroupRequireMention({
      account,
      groupId: context.chatId,
    });
    const mentionRegexes = core.channel.mentions.buildMentionRegexes(cfg, params.routeAgentId);
    const wasMentioned = core.channel.mentions.matchesMentionPatterns(rawBody, mentionRegexes);
    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg,
      surface: SIMPLEX_CHANNEL_ID,
    });
    const mentionGate = resolveInboundMentionDecision({
      facts: {
        canDetectMention: mentionRegexes.length > 0,
        wasMentioned,
      },
      policy: {
        isGroup: true,
        requireMention,
        allowTextCommands,
        hasControlCommand: core.channel.text.hasControlCommand(rawBody, cfg),
        commandAuthorized: commandAuthorized === true,
      },
    });
    effectiveWasMentioned = mentionGate.effectiveWasMentioned;
    if (mentionGate.shouldSkip) {
      runtime.log?.(
        `[${account.accountId}] SimpleX drop group ${context.chatId} (mention required)`
      );
      return { allowed: false, commandAuthorized, effectiveWasMentioned };
    }
  }

  if (isGroup && core.channel.commands.isControlCommandMessage(rawBody, cfg)) {
    if (commandAuthorized !== true) {
      runtime.log?.(
        `[${account.accountId}] SimpleX drop control command from ${context.senderId ?? "unknown"}`
      );
      return { allowed: false, commandAuthorized, effectiveWasMentioned };
    }
  }

  return { allowed: true, commandAuthorized, effectiveWasMentioned };
}
