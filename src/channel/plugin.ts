import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import {
  listSimplexAccountIds,
  resolveDefaultSimplexAccountId,
  resolveSimplexAccount,
} from "../config/accounts.js";
import { simplexMessageActions } from "../actions/actions.js";
import { SimplexChannelConfigSchema } from "../config/config-schema.js";
import { simplexSetupAdapter } from "./setup.js";
import {
  listSimplexDirectoryGroups,
  listSimplexDirectoryPeers,
  listSimplexGroupMembers,
  resolveSimplexSelf,
  resolveSimplexTargets,
} from "./simplex-directory.js";
import {
  DEFAULT_ACCOUNT_ID,
  extractSimplexWsUrlFromApplication,
  formatPairingApproveHint,
  resolveSimplexGroupRequireMention,
  resolveSimplexGroupToolPolicy,
  resolveSimplexHealthState,
  stripLeadingAt,
  stripSimplexPrefix,
} from "./simplex-common.js";
import { buildSimplexGatewayRuntime } from "./simplex-gateway-runtime.js";
import { buildSimplexOutbound } from "./simplex-outbound.js";
import { buildSimplexPairing } from "./simplex-pairing.js";
import { buildSimplexStatus } from "./simplex-status.js";
import { formatSimplexAllowFrom, resolveSimplexAllowFrom } from "./simplex-security.js";
import { SimplexWsClient } from "../simplex/simplex-ws-client.js";
import type { ResolvedSimplexAccount } from "../config/types.js";

const activeClients = new Map<string, SimplexWsClient>();

export const simplexPlugin: ChannelPlugin<ResolvedSimplexAccount> = {
  id: "openclaw-simplex",
  meta: {
    id: "openclaw-simplex",
    label: "SimpleX",
    selectionLabel: "SimpleX (WebSocket)",
    docsPath: "/channels/openclaw-simplex",
    blurb: "SimpleX Chat via external WebSocket API",
    order: 95,
    quickstartAllowFrom: true,
  },
  pairing: buildSimplexPairing(activeClients),
  capabilities: {
    chatTypes: ["direct", "group"],
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
    listAccountIds: (cfg) => listSimplexAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveSimplexAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultSimplexAccountId(cfg),
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
    resolveAllowFrom: ({ cfg, accountId }) => resolveSimplexAllowFrom({ cfg, accountId }),
    formatAllowFrom: ({ allowFrom }) => formatSimplexAllowFrom(allowFrom),
  },
  messaging: {
    normalizeTarget: (raw) => stripSimplexPrefix(raw),
    targetResolver: {
      looksLikeId: (input) => input.trim().startsWith("@") || input.trim().startsWith("#"),
      hint: "@<contactId> or #<groupId>",
    },
  },
  actions: simplexMessageActions,
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
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.["openclaw-simplex"]?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.openclaw-simplex.accounts.${resolvedAccountId}.`
        : "channels.openclaw-simplex.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("openclaw-simplex"),
        normalizeEntry: (raw) => stripLeadingAt(stripSimplexPrefix(raw)),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- SimpleX groups: groupPolicy="open" allows any member to trigger the bot. Set channels.openclaw-simplex.groupPolicy="allowlist" + channels.openclaw-simplex.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: resolveSimplexGroupRequireMention,
    resolveToolPolicy: resolveSimplexGroupToolPolicy,
  },
  outbound: buildSimplexOutbound(activeClients),
  status: buildSimplexStatus(activeClients),
  gateway: buildSimplexGatewayRuntime(activeClients),
};
