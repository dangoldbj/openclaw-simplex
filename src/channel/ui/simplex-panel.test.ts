import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";
import {
  registerSimplexControlUi,
  renderSimplexPanelHtml,
  SIMPLEX_PANEL_PATH,
} from "./simplex-panel.js";

// Port 1 is reserved and never listening, so the probe fails fast instead of
// waiting out the panel timeout.
const unreachable = { connection: { wsUrl: "ws://127.0.0.1:1" } };

describe("simplex control ui panel", () => {
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
