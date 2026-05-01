import { renderQrPngDataUrl } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { connectSimplexLink, planSimplexConnectionLink } from "../simplex/simplex-connect-link.js";
import {
  acceptSimplexContactRequest,
  listSimplexContactRequests,
  rejectSimplexContactRequest,
} from "../simplex/simplex-contact-requests.js";
import {
  createSimplexGroup,
  createSimplexGroupLink,
  listSimplexGroupLink,
  revokeSimplexGroupLink,
} from "../simplex/simplex-groups.js";
import { resolveInviteMode } from "../simplex/simplex-invite.js";
import {
  createSimplexInvite,
  listSimplexInvites,
  revokeSimplexInvite,
} from "../simplex/simplex-invite-service.js";
import {
  doctorSimplexRuntime,
  getSimplexRuntimeStatus,
} from "../simplex/simplex-runtime-status.js";

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
  const rawAccountId = typeof params?.accountId === "string" ? params.accountId.trim() : "";
  return rawAccountId || null;
}

function readRequiredString(params: Record<string, unknown> | undefined, key: string): string {
  const value = typeof params?.[key] === "string" ? params[key].trim() : "";
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function readRequiredInteger(params: Record<string, unknown> | undefined, key: string): number {
  const raw = params?.[key];
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}

function unavailable(prefix: string, err: unknown): GatewayError {
  return createError(UNAVAILABLE, `${prefix}: ${err instanceof Error ? err.message : String(err)}`);
}

export function registerSimplexGatewayMethods(api: OpenClawPluginApi): void {
  api.registerGatewayMethod(
    "simplex.invite.create",
    async ({ params, respond }) => {
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
    },
    { scope: "operator.write" }
  );

  api.registerGatewayMethod(
    "simplex.invite.list",
    async ({ params, respond }) => {
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
    },
    { scope: "operator.read" }
  );

  api.registerGatewayMethod(
    "simplex.invite.revoke",
    async ({ params, respond }) => {
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
    },
    { scope: "operator.admin" }
  );

  api.registerGatewayMethod(
    "simplex.runtime.status",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await getSimplexRuntimeStatus({ cfg: api.config, accountId: readAccountId(params) })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX runtime status failed", err));
      }
    },
    { scope: "operator.read" }
  );

  api.registerGatewayMethod(
    "simplex.runtime.doctor",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await doctorSimplexRuntime({ cfg: api.config, accountId: readAccountId(params) })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX runtime doctor failed", err));
      }
    },
    { scope: "operator.read" }
  );

  api.registerGatewayMethod(
    "simplex.requests.list",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await listSimplexContactRequests({ cfg: api.config, accountId: readAccountId(params) })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX request list failed", err));
      }
    },
    { scope: "operator.read" }
  );

  api.registerGatewayMethod(
    "simplex.requests.accept",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await acceptSimplexContactRequest({
            cfg: api.config,
            accountId: readAccountId(params),
            contactRequestId: readRequiredInteger(params, "contactRequestId"),
          })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX request accept failed", err));
      }
    },
    { scope: "operator.admin" }
  );

  api.registerGatewayMethod(
    "simplex.requests.reject",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await rejectSimplexContactRequest({
            cfg: api.config,
            accountId: readAccountId(params),
            contactRequestId: readRequiredInteger(params, "contactRequestId"),
          })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX request reject failed", err));
      }
    },
    { scope: "operator.admin" }
  );

  api.registerGatewayMethod(
    "simplex.groups.create",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await createSimplexGroup({
            cfg: api.config,
            accountId: readAccountId(params),
            displayName: readRequiredString(params, "displayName"),
            fullName: typeof params?.fullName === "string" ? params.fullName : undefined,
            description: typeof params?.description === "string" ? params.description : undefined,
          })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX group create failed", err));
      }
    },
    { scope: "operator.admin" }
  );

  api.registerGatewayMethod(
    "simplex.groups.link.create",
    async ({ params, respond }) => {
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
    },
    { scope: "operator.admin" }
  );

  api.registerGatewayMethod(
    "simplex.groups.link.list",
    async ({ params, respond }) => {
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
    },
    { scope: "operator.read" }
  );

  api.registerGatewayMethod(
    "simplex.groups.link.revoke",
    async ({ params, respond }) => {
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
    },
    { scope: "operator.admin" }
  );

  api.registerGatewayMethod(
    "simplex.connect.plan",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await planSimplexConnectionLink({
            cfg: api.config,
            accountId: readAccountId(params),
            link: readRequiredString(params, "link"),
          })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX connect plan failed", err));
      }
    },
    { scope: "operator.read" }
  );

  api.registerGatewayMethod(
    "simplex.connect",
    async ({ params, respond }) => {
      try {
        respond(
          true,
          await connectSimplexLink({
            cfg: api.config,
            accountId: readAccountId(params),
            link: readRequiredString(params, "link"),
          })
        );
      } catch (err) {
        respond(false, undefined, unavailable("SimpleX connect failed", err));
      }
    },
    { scope: "operator.admin" }
  );
}
