import { buildDmGroupAccountAllowlistAdapter } from "openclaw/plugin-sdk/allowlist-config-edit";
import {
  createHybridChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "openclaw/plugin-sdk/channel-config-helpers";
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { buildChannelOutboundSessionRoute } from "openclaw/plugin-sdk/channel-core";
import { simplexMessageActions } from "../actions/actions.js";
import { resolveSimplexAgentReactionGuidance } from "../actions/discovery.js";
import {
  listSimplexAccountIds,
  resolveDefaultSimplexAccountId,
  resolveSimplexAccount,
} from "../config/accounts.js";
import {
  SIMPLEX_ACCOUNT_CONFIG_CLEAR_FIELDS,
  SimplexChannelConfigSchema,
} from "../config/config-schema.js";
import { SIMPLEX_CHANNEL_ID, stripSimplexProviderPrefix } from "../constants.js";
import {
  SIMPLEX_GATEWAY_METHOD_DESCRIPTORS,
  SIMPLEX_GATEWAY_METHOD_NAMES,
} from "../gateway/method-descriptors.js";
import { normalizeSimplexChatRef } from "../simplex/chat-ref.js";
import type { SimplexRuntimeCapabilityReport } from "../simplex/services/runtime-capabilities.js";
import type { ResolvedSimplexAccount } from "../types/config.js";
import {
  listSimplexDirectoryGroups,
  listSimplexDirectoryPeers,
  listSimplexGroupMembers,
  resolveSimplexSelf,
  resolveSimplexTargets,
} from "./contacts/simplex-directory.js";
import { buildSimplexPairing } from "./contacts/simplex-pairing.js";
import { simplexDoctor } from "./diagnostics/simplex-doctor.js";
import { buildSimplexStatus } from "./diagnostics/simplex-status.js";
import { buildSimplexGatewayRuntime } from "./gateway/simplex-gateway-runtime.js";
import { buildSimplexHeartbeat } from "./gateway/simplex-heartbeat.js";
import { simplexLifecycle } from "./lifecycle/simplex-lifecycle.js";
import { buildSimplexOutbound } from "./messaging/simplex-outbound.js";
import { simplexApprovalAuth } from "./security/approval-auth.js";
import { simplexCommandPolicy } from "./security/command-policy.js";
import {
  collectSimplexSecurityAuditFindings,
  formatSimplexAllowFrom,
} from "./security/simplex-security.js";
import { simplexSetupContract } from "./setup.js";
import {
  formatSimplexTargetDisplay,
  inferSimplexTargetChatType,
  looksLikeSimplexExplicitTarget,
  parseSimplexExplicitTarget,
  resolveSimplexGroupRequireMention,
  resolveSimplexGroupToolPolicy,
  resolveSimplexRouteTarget,
  stripLeadingAt,
} from "./shared/simplex-common.js";

const resolveSimplexDmSecurityPolicy = createScopedDmSecurityResolver<ResolvedSimplexAccount>({
  channelKey: SIMPLEX_CHANNEL_ID,
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  resolveFallbackAccountId: (account) => account.accountId,
  approveChannelId: SIMPLEX_CHANNEL_ID,
  normalizeEntry: (raw) => stripLeadingAt(stripSimplexProviderPrefix(raw)),
});

function resolveSimplexConfigAccount(cfg: OpenClawConfig, accountId?: string | null) {
  return resolveSimplexAccount({ cfg, accountId });
}

type SimplexPlugin = ChannelPlugin<ResolvedSimplexAccount, SimplexRuntimeCapabilityReport>;

export const simplexPlugin: SimplexPlugin = {
  id: SIMPLEX_CHANNEL_ID,
  meta: {
    id: SIMPLEX_CHANNEL_ID,
    label: "SimpleX",
    selectionLabel: "SimpleX",
    detailLabel: "SimpleX Chat",
    docsPath: "/channels/openclaw-simplex",
    docsLabel: SIMPLEX_CHANNEL_ID,
    blurb: "SimpleX Chat via an external WebSocket runtime",
    aliases: ["simplex"],
    order: 95,
    systemImage: "link.badge.plus",
    selectionExtras: ["Invite-based reachability", "External WebSocket runtime"],
    markdownCapable: true,
    exposure: {
      configured: true,
      setup: true,
      docs: true,
    },
    quickstartAllowFrom: true,
  },
  pairing: buildSimplexPairing(),
  capabilities: {
    chatTypes: ["direct", "group"],
    polls: true,
    media: true,
    reactions: true,
    edit: true,
    unsend: true,
    reply: true,
    groupManagement: true,
  },
  reload: { configPrefixes: ["channels.openclaw-simplex"] },
  setupContract: simplexSetupContract,
  configSchema: SimplexChannelConfigSchema,
  config: {
    ...createHybridChannelConfigAdapter<ResolvedSimplexAccount>({
      sectionKey: SIMPLEX_CHANNEL_ID,
      listAccountIds: (cfg) => listSimplexAccountIds(cfg),
      resolveAccount: resolveSimplexConfigAccount,
      defaultAccountId: (cfg) => resolveDefaultSimplexAccountId(cfg),
      clearBaseFields: SIMPLEX_ACCOUNT_CONFIG_CLEAR_FIELDS,
      preserveSectionOnDefaultDelete: true,
      resolveAllowFrom: (account) => account.config.allowFrom,
      formatAllowFrom: (allowFrom) => formatSimplexAllowFrom(allowFrom),
    }),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      mode: account.mode,
      application: {
        wsUrl: account.wsUrl,
      },
    }),
  },
  allowlist: buildDmGroupAccountAllowlistAdapter({
    channelId: SIMPLEX_CHANNEL_ID,
    resolveAccount: ({ cfg, accountId }) => resolveSimplexConfigAccount(cfg, accountId),
    normalize: ({ values }) => formatSimplexAllowFrom(values),
    resolveDmAllowFrom: (account) => account.config.allowFrom,
    resolveGroupAllowFrom: (account) => account.config.groupAllowFrom,
    resolveDmPolicy: (account) => account.config.dmPolicy,
    resolveGroupPolicy: (account) => account.config.groupPolicy,
  }),
  messaging: {
    targetPrefixes: ["simplex"],
    normalizeTarget: (raw) => stripSimplexProviderPrefix(raw),
    resolveSessionConversation: ({ kind, rawId }) => {
      const target =
        kind === "group" || kind === "channel"
          ? resolveSimplexRouteTarget({ rawTarget: rawId })
          : null;
      return target ? { id: target.to, threadId: target.threadId ?? null } : null;
    },
    resolveOutboundSessionRoute: ({
      cfg,
      agentId,
      accountId,
      target,
      resolvedTarget,
      threadId,
    }) => {
      const rawTo = resolvedTarget?.to ?? target;
      const parsed = parseSimplexExplicitTarget(rawTo) ?? parseSimplexExplicitTarget(target);
      if (!parsed) {
        return null;
      }
      if (parsed.chatType === "channel") {
        const account = resolveSimplexAccount({ cfg, accountId });
        if (account.config.experimentalChannels !== true) {
          return null;
        }
      }
      return buildChannelOutboundSessionRoute({
        cfg,
        agentId,
        channel: SIMPLEX_CHANNEL_ID,
        accountId: accountId ?? null,
        peer: { kind: parsed.chatType, id: parsed.to },
        chatType: parsed.chatType,
        from: agentId,
        to: parsed.to,
        ...(threadId != null ? { threadId } : {}),
      });
    },
    inferTargetChatType: ({ to }) => inferSimplexTargetChatType(to),
    formatTargetDisplay: (params) => formatSimplexTargetDisplay(params),
    targetResolver: {
      looksLikeId: (input) => looksLikeSimplexExplicitTarget(input),
      hint: "@<contactId>|#<groupId>|contact:<id>|group:<id>|!<channelId>",
    },
  },
  agentPrompt: {
    reactionGuidance: ({ cfg, accountId }) => {
      const level = resolveSimplexAgentReactionGuidance({
        cfg,
        accountId: accountId ?? undefined,
      });
      return level ? { level, channelLabel: "SimpleX" } : undefined;
    },
    messageToolHints: () => [
      "- SimpleX targets: use `to`/`chatRef` as `@contactId` for DMs or `#groupId` for groups; `contact:<id>` and `group:<id>` are accepted aliases.",
      '- SimpleX polls: use `action="poll"` with a clear question and concise option labels; replies stay as normal chat messages.',
      '- SimpleX file upload: use `action="upload-file"` with `mediaUrl`, `filePath`, `path`, or `media` plus optional `caption`/`text`.',
    ],
  },
  commands: simplexCommandPolicy,
  actions: simplexMessageActions,
  approvalCapability: simplexApprovalAuth,
  directory: {
    self: async ({ cfg, accountId, runtime }) => resolveSimplexSelf({ cfg, accountId, runtime }),
    listPeers: async (params) => listSimplexDirectoryPeers(params),
    listGroups: async (params) => listSimplexDirectoryGroups(params),
    listGroupMembers: async (params) => listSimplexGroupMembers(params),
    listPeersLive: async (params) => listSimplexDirectoryPeers(params),
    listGroupsLive: async (params) => listSimplexDirectoryGroups(params),
  },
  resolver: {
    resolveTargets: async (params) => resolveSimplexTargets(params),
  },
  security: {
    resolveDmPolicy: resolveSimplexDmSecurityPolicy,
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- SimpleX groups: groupPolicy="open" allows any member to trigger the bot. Set channels.${SIMPLEX_CHANNEL_ID}.groupPolicy="allowlist" + channels.${SIMPLEX_CHANNEL_ID}.groupAllowFrom to restrict senders.`,
      ];
    },
    collectAuditFindings: ({ account, cfg }) =>
      collectSimplexSecurityAuditFindings({ account, cfg }),
  },
  groups: {
    resolveRequireMention: resolveSimplexGroupRequireMention,
    resolveToolPolicy: resolveSimplexGroupToolPolicy,
  },
  gatewayMethods: SIMPLEX_GATEWAY_METHOD_NAMES,
  gatewayMethodDescriptors: SIMPLEX_GATEWAY_METHOD_DESCRIPTORS,
  outbound: buildSimplexOutbound(),
  heartbeat: buildSimplexHeartbeat(),
  status: buildSimplexStatus(),
  doctor: simplexDoctor,
  lifecycle: simplexLifecycle,
  // SimpleX has no child threads, so a binding always lives in the conversation
  // it was started from; `resolveConversationRef` normalizes the id the same way
  // every other SimpleX surface does.
  conversationBindings: {
    supportsCurrentConversationBinding: true,
    defaultTopLevelPlacement: "current",
    resolveConversationRef: ({ conversationId }) => {
      const normalized = normalizeSimplexChatRef(conversationId);
      return normalized ? { conversationId: normalized } : null;
    },
  },
  gateway: buildSimplexGatewayRuntime(),
};
