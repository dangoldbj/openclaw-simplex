import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import { simplexApprovalAuth } from "./approval-auth.js";

describe("simplex approval auth", () => {
  it("resolves same-chat approvers from allowFrom using SimpleX contact normalization", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          allowFrom: ["alice", "@bob", "contact:carol"],
        },
      },
    } as OpenClawConfig;

    const approved = await simplexApprovalAuth.authorizeActorAction?.({
      cfg,
      accountId: "default",
      senderId: "@carol",
      action: "approve",
      approvalKind: "exec",
    });
    expect(approved).toEqual({ authorized: true });

    const denied = await simplexApprovalAuth.authorizeActorAction?.({
      cfg,
      accountId: "default",
      senderId: "@mallory",
      action: "approve",
      approvalKind: "exec",
    });
    expect(denied).toEqual({
      authorized: false,
      reason: "❌ You are not authorized to approve exec requests on SimpleX.",
    });
  });

  function authorize(allowFrom: string[], senderId: string) {
    return simplexApprovalAuth.authorizeActorAction({
      cfg: { channels: { "openclaw-simplex": { allowFrom } } } as OpenClawConfig,
      senderId,
      action: "approve",
      approvalKind: "exec",
    });
  }

  // Regression: contact normalization used to prefix everything with "@", so a
  // group id reached the approver guard as "@#ops" and slipped past the check
  // that was meant to reject it.
  it("never treats a group or channel reference as an approver", () => {
    expect(authorize(["@alice"], "#ops")).toMatchObject({ authorized: false });
    expect(authorize(["@alice"], "!news")).toMatchObject({ authorized: false });
    expect(authorize(["@alice"], "group:ops")).toMatchObject({ authorized: false });
  });

  it("does not let a group entry in allowFrom become an approver identity", () => {
    // The group entry is discarded, leaving "@alice" as the only approver.
    expect(authorize(["#ops", "@alice"], "#ops")).toMatchObject({ authorized: false });
    expect(authorize(["#ops", "@alice"], "@alice")).toMatchObject({ authorized: true });
  });
});
