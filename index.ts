import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { toDataURL as toQrDataUrl } from "qrcode";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "./src/config/accounts.js";
import { simplexPlugin } from "./src/channel/channel.js";
import { INVITE_COMMANDS, resolveInviteMode } from "./src/simplex/simplex-invite.js";
import {
  extractSimplexLink,
  extractSimplexLinks,
  extractSimplexPendingHints,
} from "./src/simplex/simplex-links.js";
import { setSimplexRuntime } from "./src/channel/runtime.js";
import { registerSimplexToolHooks, registerSimplexTools } from "./src/tools/simplex-tools.js";
import { sendSimplexCommandWithRetry } from "./src/simplex/simplex-transport.js";

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

function registerSimplexGatewayMethods(api: OpenClawPluginApi): void {
  api.registerGatewayMethod("simplex.invite.create", async ({ params, respond, context }) => {
    const mode = resolveInviteMode(params?.mode);
    if (!mode) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, 'mode must be "connect" or "address"')
      );
      return;
    }

    const cfg = api.config;
    const rawAccountId = typeof params?.accountId === "string" ? params.accountId.trim() : "";
    const accountId = rawAccountId || resolveDefaultSimplexAccountId(cfg);
    const account = resolveSimplexAccount({ cfg, accountId });

    if (!account.enabled) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, `SimpleX account "${accountId}" is disabled`)
      );
      return;
    }
    if (!account.configured) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, `SimpleX account "${accountId}" is not configured`)
      );
      return;
    }

    const command = INVITE_COMMANDS[mode];
    try {
      const response = await sendSimplexCommandWithRetry({
        account,
        command,
        logger: api.logger,
        startChannel: () => context.startChannel("simplex", accountId),
        isRunning: () => {
          const runtime = context.getRuntimeSnapshot();
          const accountRuntime = runtime.channelAccounts?.simplex?.[accountId];
          return Boolean(accountRuntime?.running ?? runtime.channels?.simplex?.running);
        },
      });
      const link = extractSimplexLink(response);
      const qrDataUrl = link ? await renderQrDataUrl(link) : null;
      respond(true, { mode, accountId, command, link, qrDataUrl, response });
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
  });
  api.registerGatewayMethod("simplex.invite.list", async ({ params, respond, context }) => {
    const cfg = api.config;
    const rawAccountId = typeof params?.accountId === "string" ? params.accountId.trim() : "";
    const accountId = rawAccountId || resolveDefaultSimplexAccountId(cfg);
    const account = resolveSimplexAccount({ cfg, accountId });

    if (!account.enabled) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, `SimpleX account "${accountId}" is disabled`)
      );
      return;
    }
    if (!account.configured) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, `SimpleX account "${accountId}" is not configured`)
      );
      return;
    }

    try {
      const [addressResponse, contactsResponse] = await Promise.all([
        sendSimplexCommandWithRetry({
          account,
          command: "/show_address",
          logger: api.logger,
          startChannel: () => context.startChannel("simplex", accountId),
          isRunning: () => {
            const runtime = context.getRuntimeSnapshot();
            const accountRuntime = runtime.channelAccounts?.simplex?.[accountId];
            return Boolean(accountRuntime?.running ?? runtime.channels?.simplex?.running);
          },
        }),
        sendSimplexCommandWithRetry({
          account,
          command: "/contacts",
          logger: api.logger,
          startChannel: () => context.startChannel("simplex", accountId),
          isRunning: () => {
            const runtime = context.getRuntimeSnapshot();
            const accountRuntime = runtime.channelAccounts?.simplex?.[accountId];
            return Boolean(accountRuntime?.running ?? runtime.channels?.simplex?.running);
          },
        }),
      ]);
      const addressLink = extractSimplexLink(addressResponse);
      const links = [
        ...new Set([
          ...extractSimplexLinks(addressResponse),
          ...extractSimplexLinks(contactsResponse),
        ]),
      ];
      const addressQrDataUrl = addressLink ? await renderQrDataUrl(addressLink) : null;
      const pendingHints = extractSimplexPendingHints(contactsResponse);
      respond(true, {
        accountId,
        addressLink,
        addressQrDataUrl,
        links,
        pendingHints,
        addressResponse,
        contactsResponse,
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
  });
  api.registerGatewayMethod("simplex.invite.revoke", async ({ params, respond, context }) => {
    const cfg = api.config;
    const rawAccountId = typeof params?.accountId === "string" ? params.accountId.trim() : "";
    const accountId = rawAccountId || resolveDefaultSimplexAccountId(cfg);
    const account = resolveSimplexAccount({ cfg, accountId });

    if (!account.enabled) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, `SimpleX account "${accountId}" is disabled`)
      );
      return;
    }
    if (!account.configured) {
      respond(
        false,
        undefined,
        createError(INVALID_REQUEST, `SimpleX account "${accountId}" is not configured`)
      );
      return;
    }

    try {
      const response = await sendSimplexCommandWithRetry({
        account,
        command: "/delete_address",
        logger: api.logger,
        startChannel: () => context.startChannel("simplex", accountId),
        isRunning: () => {
          const runtime = context.getRuntimeSnapshot();
          const accountRuntime = runtime.channelAccounts?.simplex?.[accountId];
          return Boolean(accountRuntime?.running ?? runtime.channels?.simplex?.running);
        },
      });
      respond(true, { accountId, response });
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
  });
}

export default defineChannelPluginEntry({
  id: "simplex",
  name: "SimpleX",
  description: "SimpleX Chat channel plugin via CLI",
  plugin: simplexPlugin,
  setRuntime: setSimplexRuntime,
  registerFull: (api) => {
    registerSimplexGatewayMethods(api);
    registerSimplexTools(api);
    registerSimplexToolHooks(api);
  },
});
