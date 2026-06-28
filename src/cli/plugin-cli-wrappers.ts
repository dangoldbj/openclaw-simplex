import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { callGatewayFromCli } from "openclaw/plugin-sdk/gateway-runtime";
import { resolveSimplexAccount } from "../config/accounts.js";
import * as connectLinks from "../simplex/services/connect-links.js";
import * as contactRequests from "../simplex/services/contact-requests.js";
import * as groups from "../simplex/services/groups.js";
import * as invites from "../simplex/services/invites.js";
import * as runtimeOps from "../simplex/services/runtime-operations.js";
import * as runtimeStatus from "../simplex/services/runtime-status.js";

/**
 * Native-mode CLI routing.
 *
 * The `openclaw simplex …` CLI calls these service functions directly, which
 * open their own SimpleX client. That works in `mode: "external"` (a shared
 * WebSocket runtime), but in `mode: "native"` the embedded core lives inside the
 * gateway process — a second connection is refused by the transport guard.
 *
 * These wrappers keep the exact service signatures but, for native accounts,
 * dispatch to the equivalent gateway method (which runs in-gateway against the
 * live core) via `callGatewayFromCli`. External accounts keep the original
 * local behavior unchanged. The CLI command handlers are untouched — only their
 * imports point here — and the gateway responses are supersets of the service
 * results, so existing rendering (JSON + terminal QR) works for both modes.
 */

type ServiceParams = { cfg: OpenClawConfig; accountId?: string | null };

function isNativeAccount(params: ServiceParams): boolean {
  return (
    resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId ?? null }).mode ===
    "native"
  );
}

/** Service params minus the in-process-only fields become gateway method params. */
function toGatewayParams(params: ServiceParams): Record<string, unknown> {
  const { cfg: _cfg, logger: _logger, ...rest } = params as ServiceParams & { logger?: unknown };
  return rest as Record<string, unknown>;
}

function nativeAware<P extends ServiceParams, R>(
  local: (params: P) => Promise<R>,
  gatewayMethod: string
): (params: P) => Promise<R> {
  return async (params: P): Promise<R> => {
    if (!isNativeAccount(params)) {
      return local(params);
    }
    const result = await callGatewayFromCli(gatewayMethod, {}, toGatewayParams(params), {
      progress: false,
    });
    // Gateway responses are supersets of the service results (same fields plus
    // extras like qrDataUrl), so the CLI's existing rendering works unchanged.
    return result as R;
  };
}

export const createSimplexInvite = nativeAware(
  invites.createSimplexInvite,
  "simplex.invite.create"
);
export const listSimplexInvites = nativeAware(invites.listSimplexInvites, "simplex.invite.list");
export const revokeSimplexInvite = nativeAware(
  invites.revokeSimplexInvite,
  "simplex.invite.revoke"
);

export const listSimplexContactRequests = nativeAware(
  contactRequests.listSimplexContactRequests,
  "simplex.requests.list"
);
export const acceptSimplexContactRequest = nativeAware(
  contactRequests.acceptSimplexContactRequest,
  "simplex.requests.accept"
);
export const rejectSimplexContactRequest = nativeAware(
  contactRequests.rejectSimplexContactRequest,
  "simplex.requests.reject"
);

export const createSimplexGroup = nativeAware(groups.createSimplexGroup, "simplex.groups.create");
export const createSimplexGroupLink = nativeAware(
  groups.createSimplexGroupLink,
  "simplex.groups.link.create"
);
export const listSimplexGroupLink = nativeAware(
  groups.listSimplexGroupLink,
  "simplex.groups.link.list"
);
export const revokeSimplexGroupLink = nativeAware(
  groups.revokeSimplexGroupLink,
  "simplex.groups.link.revoke"
);

export const blockSimplexGroupMember = nativeAware(
  runtimeOps.blockSimplexGroupMember,
  "simplex.groups.member.block"
);
export const deleteSimplexGroupMemberMessages = nativeAware(
  runtimeOps.deleteSimplexGroupMemberMessages,
  "simplex.groups.member.deleteMessages"
);
export const listSimplexRuntimeUsers = nativeAware(
  runtimeOps.listSimplexRuntimeUsers,
  "simplex.runtime.users"
);
export const receiveSimplexFile = nativeAware(
  runtimeOps.receiveSimplexFile,
  "simplex.files.receive"
);
export const cancelSimplexFile = nativeAware(runtimeOps.cancelSimplexFile, "simplex.files.cancel");
export const checkSimplexContactVerification = nativeAware(
  runtimeOps.checkSimplexContactVerification,
  "simplex.verification.check"
);
export const showSimplexContactVerification = nativeAware(
  runtimeOps.showSimplexContactVerification,
  "simplex.verification.show"
);
export const showSimplexRuntimeActiveUser = nativeAware(
  runtimeOps.showSimplexRuntimeActiveUser,
  "simplex.runtime.activeUser"
);

export const doctorSimplexRuntime = nativeAware(
  runtimeStatus.doctorSimplexRuntime,
  "simplex.runtime.doctor"
);
export const getSimplexRuntimeStatus = nativeAware(
  runtimeStatus.getSimplexRuntimeStatus,
  "simplex.runtime.status"
);

export const connectSimplexLink = nativeAware(connectLinks.connectSimplexLink, "simplex.connect");
export const planSimplexConnectionLink = nativeAware(
  connectLinks.planSimplexConnectionLink,
  "simplex.connect.plan"
);
