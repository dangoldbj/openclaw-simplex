import { describe, expect, it } from "vitest";
import { buildSimplexOutbound } from "./simplex-outbound.js";

describe("simplex outbound presentation support", () => {
  it("advertises presentation support with text fallback only", () => {
    const outbound = buildSimplexOutbound(new Map());

    expect(outbound.presentationCapabilities).toEqual({
      supported: true,
      buttons: false,
      selects: false,
      context: true,
      divider: true,
    });
  });

  it("renders presentation payloads into fallback text", async () => {
    const outbound = buildSimplexOutbound(new Map());
    const rendered = await outbound.renderPresentation?.({
      payload: {
        text: "Choose an option",
      },
      presentation: {
        blocks: [
          {
            type: "buttons",
            buttons: [
              { label: "Approve", value: "approve" },
              { label: "Deny", value: "deny" },
            ],
          },
        ],
      },
      ctx: {
        cfg: {},
        to: "@alice",
        text: "",
        payload: { text: "Choose an option" },
      },
    });

    expect(rendered?.text).toContain("Choose an option");
    expect(rendered?.text).toContain("Approve");
    expect(rendered?.text).toContain("Deny");
  });
});
