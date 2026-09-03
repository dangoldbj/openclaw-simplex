import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk/channel-status";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import {
  assertSimplexAccountReady,
  resolveDefaultSimplexAccountId,
  resolveSimplexAccount,
} from "../../config/accounts.js";
import { SIMPLEX_CHANNEL_ID, stripSimplexProviderPrefix } from "../../constants.js";
import { describeError } from "../../errors.js";
import { normalizeSimplexContactRef } from "../../simplex/chat-ref.js";
import {
  deleteStoredSimplexPairingRequest,
  recordSimplexPairingRequest,
} from "../../simplex/state/pairing-requests.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { buildAndSendSimplexMessages } from "../messaging/simplex-send.js";
import { stripLeadingAt } from "../shared/simplex-common.js";

export function buildSimplexPairing(): NonNullable<
  ChannelPlugin<ResolvedSimplexAccount>["pairing"]
> {
  return {
    idLabel: "simplexContactId",
    normalizeAllowEntry: (entry) => stripLeadingAt(stripSimplexProviderPrefix(entry)),
    notifyApproval: async ({ cfg, id }) => {
      const accountId = resolveDefaultSimplexAccountId(cfg);
      const account = resolveSimplexAccount({ cfg, accountId });
      assertSimplexAccountReady(account);
      await buildAndSendSimplexMessages({
        cfg,
        account,
        chatRef: normalizeSimplexContactRef(id),
        text: PAIRING_APPROVED_MESSAGE,
      });
      await deleteStoredSimplexPairingRequest({
        accountId: account.accountId,
        senderId: stripLeadingAt(stripSimplexProviderPrefix(String(id))),
      });
    },
  };
}

/**
 * Records pairing requests so the operator can see who is waiting.
 *
 * Without this the request exists only as a short-lived code in the host's
 * pairing state: nothing on the SimpleX side knows a person tried to reach the
 * agent, so the tab could show contact requests but never pairing approvals.
 */
export function registerSimplexPairingHooks(api: OpenClawPluginApi): void {
  api.on("channel_pairing_requested", async (event) => {
    if (event.channel !== SIMPLEX_CHANNEL_ID) {
      return;
    }
    try {
      await recordSimplexPairingRequest({
        accountId: event.accountId?.trim() || resolveDefaultSimplexAccountId(api.config),
        senderId: stripLeadingAt(stripSimplexProviderPrefix(event.senderId)),
        code: event.code,
        // Sender-supplied and untrusted; it is escaped wherever it is rendered.
        displayName: event.metadata?.displayName ?? event.metadata?.name,
      });
    } catch (error) {
      api.logger?.error?.(`simplex: could not record pairing request: ${describeError(error)}`);
    }
  });
}
