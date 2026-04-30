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
});
