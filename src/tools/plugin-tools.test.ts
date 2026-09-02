import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it } from "vitest";
import { registerSimplexToolHooks } from "./plugin-tools.js";

type BeforeToolCall = (event: {
  toolName: string;
  params: Record<string, unknown>;
}) => { requireApproval?: { title: string; description: string; severity: string } } | undefined;

/** Captures the `before_tool_call` handler the plugin registers. */
function captureHook(): BeforeToolCall {
  let handler: BeforeToolCall | undefined;
  const api = {
    on: (_event: string, fn: BeforeToolCall) => {
      handler = fn;
    },
  } as unknown as OpenClawPluginApi;

  registerSimplexToolHooks(api);
  if (!handler) {
    throw new Error("plugin did not register a before_tool_call hook");
  }
  return handler;
}

describe("simplex destructive tool approval", () => {
  it("requires approval only for destructive tools", () => {
    const hook = captureHook();

    expect(hook({ toolName: "simplex_invite_list", params: {} })).toBeUndefined();
    expect(hook({ toolName: "simplex_group_add_participant", params: {} })).toBeUndefined();

    for (const toolName of [
      "simplex_invite_revoke",
      "simplex_group_remove_participant",
      "simplex_group_leave",
    ]) {
      expect(hook({ toolName, params: {} })?.requireApproval).toMatchObject({
        title: "Approve SimpleX admin action",
        severity: "warning",
      });
    }
  });

  it("names the account, group, and participant in the approval prompt", () => {
    const hook = captureHook();

    const description = hook({
      toolName: "simplex_group_remove_participant",
      params: { accountId: " ops ", groupId: " #team ", memberId: " @alice " },
    })?.requireApproval?.description;

    expect(description).toContain("ops");
    expect(description).toContain("#team");
    expect(description).toContain("@alice");
  });

  it("accepts the documented aliases for group and participant", () => {
    const hook = captureHook();
    const describe_ = (params: Record<string, unknown>) =>
      hook({ toolName: "simplex_group_remove_participant", params })?.requireApproval
        ?.description ?? "";

    // groupId | chatRef | to, and participant | memberId | contactId.
    expect(describe_({ chatRef: "#ops", contactId: "@bob" })).toContain("#ops");
    expect(describe_({ to: "#ops", participant: "@bob" })).toContain("@bob");
    expect(describe_({ groupId: "", to: "#fallback" })).toContain("#fallback");
  });

  it("stays readable when nothing identifying was supplied", () => {
    const hook = captureHook();

    const description = hook({
      toolName: "simplex_group_leave",
      params: {},
    })?.requireApproval?.description;

    expect(description).toContain("unknown");
    expect(description).toContain("the active/default account");
  });
});
