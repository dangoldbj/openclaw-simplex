import {
  createResolvedApproverActionAuthAdapter,
  resolveApprovalApprovers,
} from "openclaw/plugin-sdk/approval-auth-runtime";
import { resolveSimplexAccount } from "../config/accounts.js";
import { normalizeSimplexContactRef } from "./simplex-common.js";

function normalizeSimplexApproverId(value: string | number): string | undefined {
  const normalized = normalizeSimplexContactRef(String(value));
  if (!normalized || normalized.startsWith("#")) {
    return undefined;
  }
  return normalized;
}

export const simplexApprovalAuth = createResolvedApproverActionAuthAdapter({
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
