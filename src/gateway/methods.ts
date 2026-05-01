import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { toDataURL as toQrDataUrl } from "qrcode";
import { resolveInviteMode } from "../simplex/simplex-invite.js";
import {
  createSimplexInvite,
  listSimplexInvites,
  revokeSimplexInvite,
} from "../simplex/simplex-invite-service.js";

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
  return await toQrDataUrl(value, { errorCorrectionLevel: "M", margin: 1, scale: 8 });
}

function readAccountId(params: Record<string, unknown> | undefined): string | null {
  const rawAccountId = typeof params?.accountId === "string" ? params.accountId.trim() : "";
  return rawAccountId || null;
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
        respond(
          false,
          undefined,
          createError(
            UNAVAILABLE,
            `SimpleX invite failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
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
        respond(
          false,
          undefined,
          createError(
            UNAVAILABLE,
            `SimpleX invite list failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
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
        respond(
          false,
          undefined,
          createError(
            UNAVAILABLE,
            `SimpleX invite revoke failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    },
    { scope: "operator.admin" }
  );
}
