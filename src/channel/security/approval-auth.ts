import {
  createResolvedApproverActionAuthAdapter,
  resolveApprovalApprovers,
} from "openclaw/plugin-sdk/approval-auth-runtime";
import { resolveSimplexAccount } from "../../config/accounts.js";
import { normalizeSimplexContactRef, readSimplexChatRefKind } from "../../simplex/chat-ref.js";

/**
 * Only an individual contact may approve. A group or channel reference names a
 * conversation, not a person, so it is rejected rather than coerced into an
 * approver identity.
 *
 * This guard used to be unreachable: the old contact normalizer prefixed every
 * unmarked value with `@`, so `#ops` arrived here as `@#ops` and passed.
 */
function normalizeSimplexApproverId(value: string | number): string | undefined {
  const normalized = normalizeSimplexContactRef(String(value));
  if (!normalized || readSimplexChatRefKind(normalized) !== "direct") {
    return undefined;
  }
  return normalized;
}

// Annotated rather than inferred: the inferred shape names `ChannelApprovalKind`
// from an internal SDK chunk, which is not portable. This mirrors how the SDK
// itself types the adapter.
export const simplexApprovalAuth: ReturnType<typeof createResolvedApproverActionAuthAdapter> =
  createResolvedApproverActionAuthAdapter({
    channelLabel: "SimpleX",
    resolveApprovers: ({ cfg, accountId }) => {
      const account = resolveSimplexAccount({ cfg, accountId });
      return resolveApprovalApprovers({
        allowFrom: account.config.allowFrom,
        normalizeApprover: normalizeSimplexApproverId,
      });
    },
    normalizeSenderId: (value) => normalizeSimplexApproverId(value),
  });
