import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk/channel-status";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../../config/accounts.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { buildAndSendSimplexMessages } from "../messaging/simplex-send.js";
import {
  assertSimplexOutboundAccountReady,
  normalizeSimplexContactRef,
  stripLeadingAt,
  stripSimplexPrefix,
} from "../shared/simplex-common.js";

export function buildSimplexPairing(): NonNullable<
  ChannelPlugin<ResolvedSimplexAccount>["pairing"]
> {
  return {
    idLabel: "simplexContactId",
    normalizeAllowEntry: (entry) => stripLeadingAt(stripSimplexPrefix(entry)),
    notifyApproval: async ({ cfg, id }) => {
      const accountId = resolveDefaultSimplexAccountId(cfg);
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexOutboundAccountReady(account);
      await buildAndSendSimplexMessages({
        cfg,
        account,
        chatRef: normalizeSimplexContactRef(id),
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  };
}
