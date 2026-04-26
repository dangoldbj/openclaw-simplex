import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSimplexOutbound } from "./simplex-outbound.js";

const sendMocks = vi.hoisted(() => ({
  buildAndSendSimplexMessages: vi.fn(async () => ({ messageId: "poll-1" })),
}));

vi.mock("./simplex-send.js", () => ({
  buildAndSendSimplexMessages: sendMocks.buildAndSendSimplexMessages,
}));

describe("simplex outbound presentation support", () => {
  afterEach(() => {
    sendMocks.buildAndSendSimplexMessages.mockClear();
  });

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

  it("renders polls into numbered text prompts", async () => {
    const outbound = buildSimplexOutbound(new Map());

    const result = await outbound.sendPoll?.({
      cfg: {
        channels: {
          "openclaw-simplex": {
            connection: {
              wsUrl: "ws://127.0.0.1:5225",
            },
          },
        },
      },
      to: "@alice",
      poll: {
        question: "Deploy now?",
        options: ["Yes", "No", "Ask later"],
        maxSelections: 1,
      },
    });

    expect(sendMocks.buildAndSendSimplexMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        chatRef: "@alice",
        text: expect.stringContaining("1. Yes"),
      })
    );
    expect(sendMocks.buildAndSendSimplexMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Reply with the option number or label."),
      })
    );
    expect(result).toEqual({
      channel: "openclaw-simplex",
      messageId: "poll-1",
      chatId: "@alice",
    });
  });
});
