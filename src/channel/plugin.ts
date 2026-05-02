import { buildDmGroupAccountAllowlistAdapter } from "openclaw/plugin-sdk/allowlist-config-edit";
import {
  createHybridChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "openclaw/plugin-sdk/channel-config-helpers";
import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
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
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
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
import { buildSimplexOutbound } from "./messaging/simplex-outbound.js";
import { simplexApprovalAuth } from "./security/approval-auth.js";
import { simplexCommandPolicy } from "./security/command-policy.js";
import { formatSimplexAllowFrom } from "./security/simplex-security.js";
import { simplexSetupAdapter } from "./setup.js";
import {
  formatSimplexTargetDisplay,
  inferSimplexTargetChatType,
  parseSimplexExplicitTarget,
  resolveSimplexGroupRequireMention,
  resolveSimplexGroupToolPolicy,
  resolveSimplexRouteTarget,
  stripLeadingAt,
  stripSimplexPrefix,
} from "./shared/simplex-common.js";

const resolveSimplexDmSecurityPolicy = createScopedDmSecurityResolver<ResolvedSimplexAccount>({
  channelKey: SIMPLEX_CHANNEL_ID,
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  resolveFallbackAccountId: (account) => account.accountId,
  approveChannelId: SIMPLEX_CHANNEL_ID,
  normalizeEntry: (raw) => stripLeadingAt(stripSimplexPrefix(raw)),
});

function resolveSimplexConfigAccount(cfg: OpenClawConfig, accountId?: string | null) {
  return resolveSimplexAccount({ cfg, accountId });
}

export const simplexPlugin: ChannelPlugin<ResolvedSimplexAccount> = {
  id: SIMPLEX_CHANNEL_ID,
  meta: {
    id: SIMPLEX_CHANNEL_ID,
    label: "SimpleX",
    selectionLabel: "SimpleX",
    detailLabel: "SimpleX Chat",
    docsPath: "/channels/openclaw-simplex",
    docsLabel: SIMPLEX_CHANNEL_ID,
    blurb: "SimpleX Chat via the official Node runtime",
    aliases: ["simplex"],
    order: 95,
    systemImage: "link.badge.plus",
    selectionExtras: ["Invite-based reachability", "Official Node runtime"],
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
  setup: simplexSetupAdapter,
  configSchema: SimplexChannelConfigSchema,
  config: {
    ...createHybridChannelConfigAdapter<ResolvedSimplexAccount>({
      sectionKey: SIMPLEX_CHANNEL_ID,
      listAccountIds: (cfg) => listSimplexAccountIds(cfg),
      resolveAccount: resolveSimplexConfigAccount,
      defaultAccountId: (cfg) => resolveDefaultSimplexAccountId(cfg),
      inspectAccount: (cfg, accountId) => resolveSimplexConfigAccount(cfg, accountId).config,
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
        dbFilePrefix: account.dbFilePrefix,
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
    normalizeTarget: (raw) => stripSimplexPrefix(raw),
    parseExplicitTarget: ({ raw }) => parseSimplexExplicitTarget(raw),
    resolveSessionConversation: ({ kind, rawId }) => {
      const target =
        kind === "group" || kind === "channel"
          ? resolveSimplexRouteTarget({ rawTarget: rawId })
          : null;
      return target ? { id: target.to, threadId: target.threadId ?? null } : null;
    },
    inferTargetChatType: ({ to }) => inferSimplexTargetChatType(to),
    formatTargetDisplay: (params) => formatSimplexTargetDisplay(params),
    targetResolver: {
      looksLikeId: (input) => input.trim().startsWith("@") || input.trim().startsWith("#"),
      hint: "@<contactId>|#<groupId>|contact:<id>|group:<id>",
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
  },
  groups: {
    resolveRequireMention: resolveSimplexGroupRequireMention,
    resolveToolPolicy: resolveSimplexGroupToolPolicy,
  },
  gatewayMethods: [
    "simplex.invite.create",
    "simplex.invite.list",
    "simplex.invite.revoke",
    "simplex.runtime.status",
    "simplex.runtime.doctor",
    "simplex.requests.list",
    "simplex.requests.accept",
    "simplex.requests.reject",
    "simplex.groups.create",
    "simplex.groups.link.create",
    "simplex.groups.link.list",
    "simplex.groups.link.revoke",
    "simplex.connect.plan",
    "simplex.connect",
  ],
  outbound: buildSimplexOutbound(),
  heartbeat: buildSimplexHeartbeat(),
  status: buildSimplexStatus(),
  doctor: simplexDoctor,
  gateway: buildSimplexGatewayRuntime(),
};
