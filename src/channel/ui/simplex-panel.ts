import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { withTimeout } from "openclaw/plugin-sdk/infra-runtime";
import { renderQrPngDataUrl } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { listEnabledSimplexAccounts } from "../../config/accounts.js";
import { SIMPLEX_CHANNEL_ID, SIMPLEX_PLUGIN_ID } from "../../constants.js";
import { listSimplexInvites } from "../../simplex/services/invites.js";
import { getSimplexRuntimeStatus } from "../../simplex/services/runtime-status.js";

export const SIMPLEX_PANEL_PATH = `/plugins/${SIMPLEX_PLUGIN_ID}/panel`;

/**
 * The panel is operator-facing UI, so it is bounded the same way the doctor
 * probe is: a runtime that is down renders as a offline card, never as a
 * spinning request.
 */
const PANEL_PROBE_TIMEOUT_MS = 4000;

type PanelAccount = {
  accountId: string;
  name?: string;
  wsUrl: string;
  reachable: boolean;
  error?: string;
  connected?: boolean;
  activeClient?: boolean;
  runtimeVersion?: string | null;
  hasActiveUser?: boolean;
  addressLink?: string | null;
  addressQrDataUrl?: string | null;
  warnings: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function collectPanelAccount(params: {
  cfg: OpenClawConfig;
  accountId: string;
  name?: string;
  wsUrl: string;
}): Promise<PanelAccount> {
  const base = {
    accountId: params.accountId,
    name: params.name,
    wsUrl: params.wsUrl,
    warnings: [] as string[],
  };

  try {
    const status = await withTimeout(
      getSimplexRuntimeStatus({ cfg: params.cfg, accountId: params.accountId }),
      PANEL_PROBE_TIMEOUT_MS,
      { message: `SimpleX runtime did not respond within ${PANEL_PROBE_TIMEOUT_MS}ms` }
    );

    // The address link is fetched separately and is allowed to fail on its own:
    // a runtime with no address configured is a normal state, not an error.
    let addressLink: string | null = null;
    try {
      const invites = await withTimeout(
        listSimplexInvites({ cfg: params.cfg, accountId: params.accountId }),
        PANEL_PROBE_TIMEOUT_MS
      );
      addressLink = invites.addressLink ?? null;
    } catch {
      addressLink = null;
    }

    const addressQrDataUrl = addressLink
      ? await renderQrPngDataUrl(addressLink).catch(() => null)
      : null;

    return {
      ...base,
      reachable: true,
      connected: status.runtime.connected,
      activeClient: status.runtime.activeClient,
      runtimeVersion: status.runtimeVersion,
      hasActiveUser: Boolean(status.activeUser),
      addressLink,
      addressQrDataUrl,
      warnings: status.security.transportWarnings,
    };
  } catch (error) {
    return { ...base, reachable: false, error: describeError(error) };
  }
}

function renderAccountCard(account: PanelAccount): string {
  const title = escapeHtml(account.name ?? account.accountId);
  const rows: string[] = [
    `<div class="row"><span class="k">Account</span><span class="v">${escapeHtml(account.accountId)}</span></div>`,
    `<div class="row"><span class="k">WebSocket</span><span class="v mono">${escapeHtml(account.wsUrl)}</span></div>`,
  ];

  if (!account.reachable) {
    rows.push(
      `<div class="row"><span class="k">Status</span><span class="v bad">Unreachable</span></div>`,
      `<div class="row"><span class="k">Error</span><span class="v mono">${escapeHtml(account.error ?? "unknown")}</span></div>`
    );
    return `<section class="card"><h2>${title}</h2>${rows.join("")}
      <p class="hint">Start the <code>simplex-chat</code> runtime, then reload this tab.</p>
    </section>`;
  }

  // `runtime.connected` defaults to true whenever no client is registered, so
  // it alone would report a healthy-looking "Connected" for an account whose
  // monitor is not running at all. Both facts are needed to be honest here.
  const [statusLabel, statusClass] = account.activeClient
    ? account.connected
      ? (["Connected", "good"] as const)
      : (["Disconnected", "bad"] as const)
    : (["Reachable, no active monitor", "warn"] as const);

  rows.push(
    `<div class="row"><span class="k">Status</span><span class="v ${statusClass}">${statusLabel}</span></div>`,
    `<div class="row"><span class="k">Runtime</span><span class="v mono">${escapeHtml(account.runtimeVersion ?? "unknown")}</span></div>`,
    `<div class="row"><span class="k">User profile</span><span class="v ${account.hasActiveUser ? "good" : "bad"}">${account.hasActiveUser ? "Active" : "Missing"}</span></div>`
  );

  for (const warning of account.warnings) {
    rows.push(
      `<div class="row"><span class="k">Warning</span><span class="v warn">${escapeHtml(warning)}</span></div>`
    );
  }

  const address = account.addressLink
    ? `<div class="addr">
         ${account.addressQrDataUrl ? `<img class="qr" alt="SimpleX address QR code for ${title}" src="${escapeHtml(account.addressQrDataUrl)}" />` : ""}
         <div class="addr-text">
           <span class="k">Address link</span>
           <code class="link">${escapeHtml(account.addressLink)}</code>
           <p class="hint">Scan with the SimpleX app, or share this link, to start a conversation with this agent.</p>
         </div>
       </div>`
    : `<p class="hint">No address link yet. Create one with <code>openclaw simplex address create</code>.</p>`;

  return `<section class="card"><h2>${title}</h2>${rows.join("")}${address}</section>`;
}

export async function renderSimplexPanelHtml(cfg: OpenClawConfig): Promise<string> {
  const accounts = listEnabledSimplexAccounts(cfg).filter((account) => account.configured);

  const cards =
    accounts.length === 0
      ? `<section class="card"><h2>No SimpleX account configured</h2>
           <p class="hint">Add a <code>channels.${SIMPLEX_CHANNEL_ID}</code> connection, then reload this tab.</p>
         </section>`
      : (
          await Promise.all(
            accounts.map((account) =>
              collectPanelAccount({
                cfg,
                accountId: account.accountId,
                name: account.name,
                wsUrl: account.wsUrl,
              })
            )
          )
        )
          .map(renderAccountCard)
          .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SimpleX</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 20px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  .card { border: 1px solid rgba(128,128,128,.35); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .card h2 { font-size: 15px; margin: 0 0 12px; }
  .row { display: flex; gap: 12px; padding: 3px 0; }
  .k { flex: 0 0 110px; opacity: .7; }
  .v { flex: 1 1 auto; word-break: break-word; }
  .mono, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .good { color: #158a4a; } .warn { color: #9a6400; } .bad { color: #b3261e; }
  .addr { display: flex; gap: 16px; align-items: flex-start; margin-top: 14px; flex-wrap: wrap; }
  .qr { width: 160px; height: 160px; image-rendering: pixelated; background: #fff; border-radius: 8px; }
  .addr-text { flex: 1 1 260px; min-width: 240px; }
  .link { display: block; margin-top: 6px; word-break: break-all; }
  .hint { opacity: .7; margin: 8px 0 0; }
</style>
</head>
<body>
<h1>SimpleX</h1>
${cards}
</body>
</html>`;
}

/**
 * Adds a SimpleX tab to the Control UI, backed by a gateway-authenticated route.
 *
 * External channels fall back to the generic channel card, which has no place
 * for an invite link or a scannable code. An own tab is the supported way to
 * surface them without core UI changes.
 */
export function registerSimplexControlUi(api: OpenClawPluginApi): void {
  api.registerHttpRoute({
    path: SIMPLEX_PANEL_PATH,
    auth: "gateway",
    match: "exact",
    handler: async (_req, res) => {
      try {
        const html = await renderSimplexPanelHtml(api.config);
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          // The panel embeds live invite links; keep it out of shared caches.
          "cache-control": "no-store",
        });
        res.end(html);
      } catch (error) {
        api.logger?.error?.(`simplex: panel render failed: ${describeError(error)}`);
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end("SimpleX panel failed to render. Check the OpenClaw logs.");
      }
      return true;
    },
  });

  api.session.controls.registerControlUiDescriptor({
    id: `${SIMPLEX_PLUGIN_ID}-panel`,
    surface: "tab",
    label: "SimpleX",
    description: "SimpleX runtime status, address link, and connection QR code",
    path: SIMPLEX_PANEL_PATH,
    group: "control",
    icon: "message-circle",
  });
}
