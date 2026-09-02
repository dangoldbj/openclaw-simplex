import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { beforeEach, describe, expect, it } from "vitest";
import { recordSimplexContactRequest } from "../../simplex/state/contact-requests.js";
import { setSimplexRuntime } from "../runtime.js";
import {
  registerSimplexControlUi,
  renderSimplexPanelHtml,
  SIMPLEX_PANEL_PATH,
} from "./simplex-panel.js";

// Port 1 is reserved and never listening, so the probe fails fast instead of
// waiting out the panel timeout.
const unreachable = { connection: { wsUrl: "ws://127.0.0.1:1" } };

describe("simplex control ui panel", () => {
  beforeEach(() => {
    // No `state` on the runtime, so the keyed store falls back to memory.
    setSimplexRuntime({} as object as Partial<PluginRuntime> as PluginRuntime);
  });

  it("explains how to configure when no account exists", async () => {
    const html = await renderSimplexPanelHtml({ channels: {} } as OpenClawConfig);

    expect(html).toContain("No SimpleX account configured");
    expect(html).toContain("channels.openclaw-simplex");
  });

  it("renders an offline card instead of failing when the runtime is down", async () => {
    const html = await renderSimplexPanelHtml({
      channels: { "openclaw-simplex": unreachable },
    } as OpenClawConfig);

    expect(html).toContain("Unreachable");
    expect(html).toContain("ws://127.0.0.1:1");
    expect(html).toContain("simplex-chat");
  });

  it("escapes account-controlled text into the document", async () => {
    const html = await renderSimplexPanelHtml({
      channels: {
        "openclaw-simplex": {
          accounts: {
            evil: { ...unreachable, name: "<script>alert('xss')</script>" },
          },
        },
      },
    } as OpenClawConfig);

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("lists pending contact requests with the commands that act on them", async () => {
    await recordSimplexContactRequest({
      accountId: "pending",
      contactRequest: {
        contactRequestId: 7,
        localDisplayName: "alice",
        createdAt: "2026-09-02T09:00:00Z",
      },
    });

    const html = await renderSimplexPanelHtml({
      channels: { "openclaw-simplex": { accounts: { pending: unreachable } } },
    } as OpenClawConfig);

    expect(html).toContain("1 pending");
    expect(html).toContain("alice");
    expect(html).toContain("2026-09-02T09:00:00Z");
    expect(html).toContain(
      "openclaw simplex requests accept --contact-request-id 7 --account-id pending"
    );
    expect(html).toContain(
      "openclaw simplex requests reject --contact-request-id 7 --account-id pending"
    );
  });

  it("keeps pending requests visible while the runtime is unreachable", async () => {
    await recordSimplexContactRequest({
      accountId: "offline",
      contactRequest: { contactRequestId: 12, localDisplayName: "bob" },
    });

    const html = await renderSimplexPanelHtml({
      channels: { "openclaw-simplex": { accounts: { offline: unreachable } } },
    } as OpenClawConfig);

    expect(html).toContain("Unreachable");
    expect(html).toContain("openclaw simplex requests accept --contact-request-id 12");
  });

  it("escapes request display names into the document", async () => {
    await recordSimplexContactRequest({
      accountId: "hostile",
      contactRequest: { contactRequestId: 3, localDisplayName: "<img src=x onerror=alert(1)>" },
    });

    const html = await renderSimplexPanelHtml({
      channels: { "openclaw-simplex": { accounts: { hostile: unreachable } } },
    } as OpenClawConfig);

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });

  it("says nobody is waiting when no request is pending", async () => {
    const html = await renderSimplexPanelHtml({
      channels: { "openclaw-simplex": { accounts: { quiet: unreachable } } },
    } as OpenClawConfig);

    expect(html).toContain("Nobody is waiting");
    expect(html).not.toContain("pending</span>");
  });

  it("reports a failed request lookup instead of an empty queue", async () => {
    // Only `null` puts the store back into its uninitialized state, which is
    // what makes the keyed-store lookup throw instead of falling back.
    setSimplexRuntime(null as unknown as PluginRuntime);

    const html = await renderSimplexPanelHtml({
      channels: { "openclaw-simplex": { accounts: { broken: unreachable } } },
    } as OpenClawConfig);

    expect(html).toContain("Could not read pending requests");
    expect(html).not.toContain("Nobody is waiting");
  });

  it("registers a gateway-authenticated route and a Control UI tab", () => {
    const routes: Array<{ path: string; auth: string; match?: string }> = [];
    const descriptors: Array<{ id: string; surface: string; path?: string }> = [];

    const api = {
      config: { channels: {} },
      registerHttpRoute: (params: { path: string; auth: string; match?: string }) => {
        routes.push(params);
      },
      session: {
        controls: {
          registerControlUiDescriptor: (descriptor: {
            id: string;
            surface: string;
            path?: string;
          }) => {
            descriptors.push(descriptor);
          },
        },
      },
    } as unknown as OpenClawPluginApi;

    registerSimplexControlUi(api);

    expect(routes).toEqual([
      { path: SIMPLEX_PANEL_PATH, auth: "gateway", match: "exact", handler: expect.any(Function) },
    ]);
    expect(descriptors[0]).toMatchObject({
      surface: "tab",
      label: "SimpleX",
      path: SIMPLEX_PANEL_PATH,
    });
  });
});
