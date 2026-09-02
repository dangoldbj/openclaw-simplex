import {
  createResolvedApproverActionAuthAdapter,
  resolveApprovalApprovers,
} from "openclaw/plugin-sdk/approval-auth-runtime";
import { resolveSimplexAccount } from "../../config/accounts.js";
import { normalizeSimplexContactRef } from "../shared/simplex-common.js";

function normalizeSimplexApproverId(value: string | number): string | undefined {
  const normalized = normalizeSimplexContactRef(String(value));
  if (!normalized || normalized.startsWith("#")) {
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
