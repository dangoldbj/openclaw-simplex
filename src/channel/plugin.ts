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
import type { ResolvedSimplexAccount } from "../config/types.js";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";
import type { SimplexWsClient } from "../simplex/simplex-ws-client.js";
import { simplexApprovalAuth } from "./approval-auth.js";
import { simplexCommandPolicy } from "./command-policy.js";
import { simplexSetupAdapter } from "./setup.js";
import {
  formatSimplexTargetDisplay,
  inferSimplexTargetChatType,
  parseSimplexExplicitTarget,
  resolveSimplexGroupRequireMention,
  resolveSimplexGroupToolPolicy,
  stripLeadingAt,
  stripSimplexPrefix,
} from "./simplex-common.js";
import {
  listSimplexDirectoryGroups,
  listSimplexDirectoryPeers,
  listSimplexGroupMembers,
  resolveSimplexSelf,
  resolveSimplexTargets,
} from "./simplex-directory.js";
import { simplexDoctor } from "./simplex-doctor.js";
import { buildSimplexGatewayRuntime } from "./simplex-gateway-runtime.js";
import { buildSimplexHeartbeat } from "./simplex-heartbeat.js";
import { buildSimplexOutbound } from "./simplex-outbound.js";
import { buildSimplexPairing } from "./simplex-pairing.js";
import { formatSimplexAllowFrom } from "./simplex-security.js";
import { buildSimplexStatus } from "./simplex-status.js";

const activeClients = new Map<string, SimplexWsClient>();

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
    selectionLabel: "SimpleX (WebSocket)",
    detailLabel: "SimpleX Chat",
    docsPath: "/channels/openclaw-simplex",
    docsLabel: SIMPLEX_CHANNEL_ID,
    blurb: "SimpleX Chat via external WebSocket API",
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
  pairing: buildSimplexPairing(activeClients),
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
    normalizeTarget: (raw) => stripSimplexPrefix(raw),
    parseExplicitTarget: ({ raw }) => parseSimplexExplicitTarget(raw),
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
  gatewayMethods: ["simplex.invite.create", "simplex.invite.list", "simplex.invite.revoke"],
  outbound: buildSimplexOutbound(activeClients),
  heartbeat: buildSimplexHeartbeat(activeClients),
  status: buildSimplexStatus(activeClients),
  doctor: simplexDoctor,
  gateway: buildSimplexGatewayRuntime(activeClients),
};
