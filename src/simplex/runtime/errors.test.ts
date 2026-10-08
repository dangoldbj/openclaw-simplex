import { describe, expect, it } from "vitest";
import { resolveSimplexCommandError } from "./errors.js";

describe("resolveSimplexCommandError", () => {
  it("ignores responses that are not command errors", () => {
    expect(resolveSimplexCommandError(undefined)).toBeUndefined();
    expect(resolveSimplexCommandError({ type: "newChatItems" })).toBeUndefined();
  });

  it("prefers the runtime's own message", () => {
    expect(
      resolveSimplexCommandError({
        type: "chatCmdError",
        chatError: {
          type: "error",
          errorType: { type: "invalidConnReq", message: "invalid connection link" },
        },
      })
    ).toBe("invalid connection link");
  });

  it("names a command error by its tag", () => {
    expect(
      resolveSimplexCommandError({
        type: "chatCmdError",
        chatError: { type: "error", errorType: { type: "noActiveUser" } },
      })
    ).toBe("SimpleX command error: noActiveUser");
  });

  // Payload from #33: a reply quoting a photo exceeded the encoded message limit.
  it("names a store error instead of failing generically", () => {
    expect(
      resolveSimplexCommandError({
        type: "chatCmdError",
        chatError: { type: "errorStore", storeError: { type: "largeMsg" } },
      })
    ).toBe("SimpleX store error: largeMsg");
  });

  it("names an agent error down to its nested cause", () => {
    expect(
      resolveSimplexCommandError({
        type: "chatCmdError",
        chatError: {
          type: "errorAgent",
          agentConnId: "abc",
          agentError: {
            type: "SMP",
            serverAddress: "smp://example",
            smpErr: { type: "PROXY", proxyErr: { type: "NO_SESSION" } },
          },
        },
      })
    ).toBe("SimpleX agent error: SMP PROXY NO_SESSION");
  });

  it("falls back when the error carries nothing readable", () => {
    expect(resolveSimplexCommandError({ type: "chatCmdError" })).toBe("SimpleX command failed");
    expect(
      resolveSimplexCommandError({ type: "chatCmdError", chatError: { type: "errorStore" } })
    ).toBe("SimpleX command failed");
  });
});
