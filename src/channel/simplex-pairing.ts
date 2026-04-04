import { PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk/channel-status";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import {
  assertSimplexOutboundAccountReady,
  normalizeSimplexContactRef,
  stripLeadingAt,
  stripSimplexPrefix,
} from "./simplex-common.js";
import { buildAndSendSimplexMessages } from "./simplex-send.js";

export function buildSimplexPairing(
  registry: SimplexClientRegistry
): NonNullable<ChannelPlugin<ResolvedSimplexAccount>["pairing"]> {
  return {
    idLabel: "simplexContactId",
    normalizeAllowEntry: (entry) => stripLeadingAt(stripSimplexPrefix(entry)),
    notifyApproval: async ({ cfg, id }) => {
      const accountId = resolveDefaultSimplexAccountId(cfg);
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexOutboundAccountReady(account);
      await buildAndSendSimplexMessages({
        registry,
        cfg,
        account,
        chatRef: normalizeSimplexContactRef(id),
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  };
}
