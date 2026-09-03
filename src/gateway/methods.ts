import { renderQrPngDataUrl } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { describeError } from "../errors.js";
import {
  readOptionalString,
  readRequiredPositiveInteger,
  readRequiredStringParam,
} from "../params.js";
import {
  connectSimplexLink,
  planSimplexConnectionLink,
} from "../simplex/services/connect-links.js";
import {
  acceptSimplexContactRequest,
  listSimplexContactRequests,
  rejectSimplexContactRequest,
} from "../simplex/services/contact-requests.js";
import {
  createSimplexGroup,
  createSimplexGroupLink,
  listSimplexGroupLink,
  revokeSimplexGroupLink,
} from "../simplex/services/groups.js";
import {
  createSimplexInvite,
  listSimplexInvites,
  resolveInviteMode,
  revokeSimplexInvite,
} from "../simplex/services/invites.js";
import {
  blockSimplexGroupMember,
  cancelSimplexFile,
  checkSimplexContactVerification,
  deleteSimplexGroupMemberMessages,
  listSimplexRuntimeUsers,
  receiveSimplexFile,
  showSimplexContactVerification,
  showSimplexRuntimeActiveUser,
} from "../simplex/services/runtime-operations.js";
import {
  doctorSimplexRuntime,
  getSimplexRuntimeStatus,
} from "../simplex/services/runtime-status.js";
import {
  resolveSimplexGatewayMethodScope,
  type SimplexGatewayMethodName,
} from "./method-descriptors.js";

const INVALID_REQUEST = "INVALID_REQUEST";
const UNAVAILABLE = "UNAVAILABLE";

type GatewayError = {
  code: string;
  message: string;
};

function createError(code: string, message: string): GatewayError {
  return { code, message };
}

async function renderQrDataUrl(value: string): Promise<string> {
  return await renderQrPngDataUrl(value, { marginModules: 1, scale: 8 });
}

function readAccountId(params: Record<string, unknown> | undefined): string | null {
  return readOptionalString(params?.accountId) ?? null;
}

function unavailable(prefix: string, err: unknown): GatewayError {
  return createError(UNAVAILABLE, `${prefix}: ${describeError(err)}`);
}

type SimplexGatewayHandler = Parameters<OpenClawPluginApi["registerGatewayMethod"]>[1];

export function registerSimplexGatewayMethods(api: OpenClawPluginApi): void {
  const registerMethod = (name: SimplexGatewayMethodName, handler: SimplexGatewayHandler) => {
    api.registerGatewayMethod(name, handler, { scope: resolveSimplexGatewayMethodScope(name) });
  };

  registerMethod("simplex.invite.create", async ({ params, respond }) => {
    const mode = resolveInviteMode(params?.mode);
    if (!mode) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, 'mode must be "connect" or "address"')
      );
      return;
    }

    const accountId = readAccountId(params);
    try {
      const result = await createSimplexInvite({
        cfg: api.config,
        accountId,
        mode,
        logger: api.logger,
      });
      const qrDataUrl = result.link ? await renderQrDataUrl(result.link) : null;
      respond(true, { ...result, qrDataUrl });
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX invite failed", err));
    }
  });

  registerMethod("simplex.invite.list", async ({ params, respond }) => {
    const accountId = readAccountId(params);
    try {
      const result = await listSimplexInvites({
        cfg: api.config,
        accountId,
        logger: api.logger,
      });
      const addressQrDataUrl = result.addressLink
        ? await renderQrDataUrl(result.addressLink)
        : null;
      respond(true, {
        ...result,
        addressQrDataUrl,
      });
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX invite list failed", err));
    }
  });

  registerMethod("simplex.invite.revoke", async ({ params, respond }) => {
    const accountId = readAccountId(params);
    try {
      const result = await revokeSimplexInvite({
        cfg: api.config,
        accountId,
        logger: api.logger,
      });
      respond(true, result);
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX invite revoke failed", err));
    }
  });

  registerMethod("simplex.runtime.status", async ({ params, respond }) => {
    try {
      respond(
        true,
        await getSimplexRuntimeStatus({ cfg: api.config, accountId: readAccountId(params) })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX runtime status failed", err));
    }
  });

  registerMethod("simplex.runtime.doctor", async ({ params, respond }) => {
    try {
      respond(
        true,
        await doctorSimplexRuntime({ cfg: api.config, accountId: readAccountId(params) })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX runtime doctor failed", err));
    }
  });

  registerMethod("simplex.runtime.users", async ({ params, respond }) => {
    try {
      respond(
        true,
        await listSimplexRuntimeUsers({ cfg: api.config, accountId: readAccountId(params) })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX runtime users failed", err));
    }
  });

  registerMethod("simplex.runtime.activeUser", async ({ params, respond }) => {
    try {
      respond(
        true,
        await showSimplexRuntimeActiveUser({ cfg: api.config, accountId: readAccountId(params) })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX runtime active user failed", err));
    }
  });

  registerMethod("simplex.verification.show", async ({ params, respond }) => {
    try {
      respond(
        true,
        await showSimplexContactVerification({
          cfg: api.config,
          accountId: readAccountId(params),
          contactId: params?.contactId,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX verification show failed", err));
    }
  });

  registerMethod("simplex.verification.check", async ({ params, respond }) => {
    try {
      respond(
        true,
        await checkSimplexContactVerification({
          cfg: api.config,
          accountId: readAccountId(params),
          contactId: params?.contactId,
          code: typeof params?.code === "string" ? params.code : null,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX verification check failed", err));
    }
  });

  registerMethod("simplex.requests.list", async ({ params, respond }) => {
    try {
      respond(
        true,
        await listSimplexContactRequests({ cfg: api.config, accountId: readAccountId(params) })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX request list failed", err));
    }
  });

  registerMethod("simplex.requests.accept", async ({ params, respond }) => {
    try {
      respond(
        true,
        await acceptSimplexContactRequest({
          cfg: api.config,
          accountId: readAccountId(params),
          contactRequestId: readRequiredPositiveInteger(params, "contactRequestId"),
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX request accept failed", err));
    }
  });

  registerMethod("simplex.requests.reject", async ({ params, respond }) => {
    try {
      respond(
        true,
        await rejectSimplexContactRequest({
          cfg: api.config,
          accountId: readAccountId(params),
          contactRequestId: readRequiredPositiveInteger(params, "contactRequestId"),
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX request reject failed", err));
    }
  });

  registerMethod("simplex.groups.create", async ({ params, respond }) => {
    try {
      respond(
        true,
        await createSimplexGroup({
          cfg: api.config,
          accountId: readAccountId(params),
          displayName: readRequiredStringParam(params, "displayName"),
          fullName: typeof params?.fullName === "string" ? params.fullName : undefined,
          description: typeof params?.description === "string" ? params.description : undefined,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX group create failed", err));
    }
  });

  registerMethod("simplex.groups.link.create", async ({ params, respond }) => {
    try {
      const result = await createSimplexGroupLink({
        cfg: api.config,
        accountId: readAccountId(params),
        groupId: params?.groupId,
        role: params?.role,
      });
      respond(true, {
        ...result,
        qrDataUrl: result.link ? await renderQrDataUrl(result.link) : null,
      });
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX group link create failed", err));
    }
  });

  registerMethod("simplex.groups.link.list", async ({ params, respond }) => {
    try {
      const result = await listSimplexGroupLink({
        cfg: api.config,
        accountId: readAccountId(params),
        groupId: params?.groupId,
      });
      respond(true, {
        ...result,
        qrDataUrl: result.link ? await renderQrDataUrl(result.link) : null,
      });
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX group link list failed", err));
    }
  });

  registerMethod("simplex.groups.link.revoke", async ({ params, respond }) => {
    try {
      respond(
        true,
        await revokeSimplexGroupLink({
          cfg: api.config,
          accountId: readAccountId(params),
          groupId: params?.groupId,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX group link revoke failed", err));
    }
  });

  registerMethod("simplex.groups.member.block", async ({ params, respond }) => {
    try {
      respond(
        true,
        await blockSimplexGroupMember({
          cfg: api.config,
          accountId: readAccountId(params),
          groupId: params?.groupId,
          memberId: params?.memberId,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX group member block failed", err));
    }
  });

  registerMethod("simplex.groups.member.deleteMessages", async ({ params, respond }) => {
    try {
      respond(
        true,
        await deleteSimplexGroupMemberMessages({
          cfg: api.config,
          accountId: readAccountId(params),
          groupId: params?.groupId,
          memberId: params?.memberId,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX group member delete messages failed", err));
    }
  });

  registerMethod("simplex.files.receive", async ({ params, respond }) => {
    try {
      respond(
        true,
        await receiveSimplexFile({
          cfg: api.config,
          accountId: readAccountId(params),
          fileId: params?.fileId,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX file receive failed", err));
    }
  });

  registerMethod("simplex.files.cancel", async ({ params, respond }) => {
    try {
      respond(
        true,
        await cancelSimplexFile({
          cfg: api.config,
          accountId: readAccountId(params),
          fileId: params?.fileId,
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX file cancel failed", err));
    }
  });

  registerMethod("simplex.connect.plan", async ({ params, respond }) => {
    try {
      respond(
        true,
        await planSimplexConnectionLink({
          cfg: api.config,
          accountId: readAccountId(params),
          link: readRequiredStringParam(params, "link"),
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX connect plan failed", err));
    }
  });

  registerMethod("simplex.connect", async ({ params, respond }) => {
    try {
      respond(
        true,
        await connectSimplexLink({
          cfg: api.config,
          accountId: readAccountId(params),
          link: readRequiredStringParam(params, "link"),
        })
      );
    } catch (err) {
      respond(false, undefined, unavailable("SimpleX connect failed", err));
    }
  });
}
