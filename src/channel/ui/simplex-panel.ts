import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { withTimeout } from "openclaw/plugin-sdk/infra-runtime";
import { renderQrPngDataUrl } from "openclaw/plugin-sdk/media-runtime";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { listEnabledSimplexAccounts } from "../../config/accounts.js";
import { SIMPLEX_CHANNEL_ID, SIMPLEX_PLUGIN_ID } from "../../constants.js";
import { describeError } from "../../errors.js";
import { listSimplexContactRequests } from "../../simplex/services/contact-requests.js";
import { listSimplexInvites } from "../../simplex/services/invites.js";
import { getSimplexRuntimeStatus } from "../../simplex/services/runtime-status.js";

export const SIMPLEX_PANEL_PATH = `/plugins/${SIMPLEX_PLUGIN_ID}/panel`;

/**
 * The panel is operator-facing UI, so it is bounded the same way the doctor
 * probe is: a runtime that is down renders as a offline card, never as a
 * spinning request.
 */
const PANEL_PROBE_TIMEOUT_MS = 4000;

type PanelContactRequest = {
  contactRequestId: number;
  displayName?: string;
  receivedAt?: string;
};

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
  requests: PanelContactRequest[];
  requestsError?: string;
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

async function collectPanelContactRequests(params: {
  cfg: OpenClawConfig;
  accountId: string;
}): Promise<PanelContactRequest[]> {
  const { requests } = await withTimeout(
    listSimplexContactRequests({ cfg: params.cfg, accountId: params.accountId }),
    PANEL_PROBE_TIMEOUT_MS
  );
  return requests.map((request) => ({
    contactRequestId: request.contactRequestId,
    displayName: request.displayName,
    receivedAt: request.createdAt ?? new Date(request.storedAt).toISOString(),
  }));
}

async function collectPanelAccount(params: {
  cfg: OpenClawConfig;
  accountId: string;
  name?: string;
  wsUrl: string;
}): Promise<PanelAccount> {
  // Contact requests are read from the plugin's own store rather than the
  // runtime, so a queue that built up while `simplex-chat` was down stays
  // visible on the offline card instead of disappearing with it.
  const requests = collectPanelContactRequests({
    cfg: params.cfg,
    accountId: params.accountId,
  }).then(
    (list) => ({ requests: list }),
    // A failed lookup must not render as "nobody is waiting": an operator would
    // read that as an empty queue rather than an unanswered one.
    (error) => ({ requests: [] as PanelContactRequest[], requestsError: describeError(error) })
  );

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
      ...(await requests),
      warnings: status.security.transportWarnings,
    };
  } catch (error) {
    return { ...base, reachable: false, error: describeError(error), ...(await requests) };
  }
}

/**
 * Commands are rendered rather than run: the Control UI plugin frame is
 * authenticated by a cookie the gateway honours for GET and HEAD only, so a
 * button that posted back to this route would be rejected. Copying the exact
 * command is the closest the panel can get to a one-click action.
 */
function renderCommand(command: string): string {
  return `<div class="cmd"><code>${escapeHtml(command)}</code><button class="copy" type="button" data-copy>Copy</button></div>`;
}

function renderRequestsSection(account: PanelAccount): string {
  const accountFlag = `--account-id ${account.accountId}`;

  if (account.requestsError) {
    return `<div class="requests">
      <div class="section-head"><span class="k">Contact requests</span></div>
      <p class="v bad">Could not read pending requests: <span class="mono">${escapeHtml(account.requestsError)}</span></p>
      ${renderCommand(`openclaw simplex requests list ${accountFlag}`)}
    </div>`;
  }

  if (account.requests.length === 0) {
    return `<div class="requests">
      <div class="section-head"><span class="k">Contact requests</span></div>
      <p class="hint">Nobody is waiting. New requests appear here as they arrive.</p>
    </div>`;
  }

  const items = account.requests
    .map((request) => {
      const who = escapeHtml(request.displayName ?? "Unnamed contact");
      const when = request.receivedAt
        ? `<span class="when">${escapeHtml(request.receivedAt)}</span>`
        : "";
      const target = `--contact-request-id ${request.contactRequestId} ${accountFlag}`;
      return `<li class="req">
        <div class="req-head"><strong>${who}</strong><span class="mono">#${request.contactRequestId}</span>${when}</div>
        ${renderCommand(`openclaw simplex requests accept ${target}`)}
        ${renderCommand(`openclaw simplex requests reject ${target}`)}
      </li>`;
    })
    .join("");

  return `<div class="requests">
    <div class="section-head"><span class="k">Contact requests</span><span class="count">${account.requests.length} pending</span></div>
    <ul class="req-list">${items}</ul>
  </div>`;
}

function renderAddressSection(account: PanelAccount): string {
  const title = escapeHtml(account.name ?? account.accountId);
  const accountFlag = `--account-id ${account.accountId}`;

  if (!account.addressLink) {
    return `<div class="addr-block">
      <div class="section-head"><span class="k">Address link</span></div>
      <p class="hint">No address link yet. Create one so people can reach this agent.</p>
      ${renderCommand(`openclaw simplex address create ${accountFlag}`)}
      ${renderCommand(`openclaw simplex invite create ${accountFlag}`)}
    </div>`;
  }

  return `<div class="addr-block">
    <div class="section-head"><span class="k">Address link</span></div>
    <div class="addr">
      ${account.addressQrDataUrl ? `<img class="qr" alt="SimpleX address QR code for ${title}" src="${escapeHtml(account.addressQrDataUrl)}" />` : ""}
      <div class="addr-text">
        <code class="link">${escapeHtml(account.addressLink)}</code>
        <p class="hint">Scan with the SimpleX app, or share this link, to start a conversation with this agent.</p>
        ${renderCommand(`openclaw simplex invite create ${accountFlag}`)}
        ${renderCommand(`openclaw simplex address revoke ${accountFlag}`)}
      </div>
    </div>
  </div>`;
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
      ${renderRequestsSection(account)}
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

  return `<section class="card"><h2>${title}</h2>${rows.join("")}${renderRequestsSection(account)}${renderAddressSection(account)}</section>`;
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
  .addr { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
  .qr { width: 160px; height: 160px; image-rendering: pixelated; background: #fff; border-radius: 8px; }
  .addr-text { flex: 1 1 260px; min-width: 240px; }
  .link { display: block; word-break: break-all; }
  .hint { opacity: .7; margin: 8px 0 0; }
  .head { display: flex; align-items: baseline; gap: 12px; margin: 0 0 16px; }
  .head h1 { margin: 0; }
  .section-head { display: flex; align-items: baseline; gap: 10px; margin: 16px 0 8px; padding-top: 12px; border-top: 1px solid rgba(128,128,128,.25); }
  .count { font-size: 12px; opacity: .7; }
  .req-list { list-style: none; margin: 0; padding: 0; }
  .req { padding: 8px 0; }
  .req + .req { border-top: 1px dashed rgba(128,128,128,.25); }
  .req-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
  .when { font-size: 12px; opacity: .6; }
  .cmd { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .cmd code { flex: 1 1 auto; padding: 5px 8px; border-radius: 6px; background: rgba(128,128,128,.14); word-break: break-all; }
  button { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 6px; cursor: pointer;
           border: 1px solid rgba(128,128,128,.45); background: transparent; color: inherit; }
  button:hover { background: rgba(128,128,128,.14); }
</style>
</head>
<body>
<div class="head"><h1>SimpleX</h1><button type="button" data-refresh>Refresh</button></div>
${cards}
<script>
function selectCommand(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  if (target.closest("button[data-refresh]")) {
    location.reload();
    return;
  }
  const button = target.closest("button[data-copy]");
  const code = button?.previousElementSibling;
  if (!button || !code) {
    return;
  }
  // Clipboard access is unavailable in an opaque-origin frame, so selecting the
  // command leaves the operator one keystroke away from copying it.
  if (!navigator.clipboard) {
    selectCommand(code);
    return;
  }
  navigator.clipboard.writeText(code.textContent ?? "").then(() => {
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  }, () => selectCommand(code));
});
</script>
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
