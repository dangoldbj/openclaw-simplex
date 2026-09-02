import { describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../test-support/simplex-account.js";
import type { SimplexActionParams } from "../types/actions.js";
import { executeSimplexGroupAction } from "./group-actions.js";

const client = vi.hoisted(() => ({
  updateGroupProfile: vi.fn(async () => ({})),
  addGroupMember: vi.fn(async () => ({})),
  removeGroupMember: vi.fn(async () => ({})),
  leaveGroup: vi.fn(async () => ({})),
}));

vi.mock("../simplex/runtime/transport.js", () => ({
  withSimplexClient: async <T>(params: { run: (client: unknown) => Promise<T> }): Promise<T> =>
    await params.run(client),
}));

const account = testSimplexAccount();

function run(action: string, toolParams: SimplexActionParams) {
  return executeSimplexGroupAction({
    action: action as Parameters<typeof executeSimplexGroupAction>[0]["action"],
    account,
    toolParams,
  });
}

describe("simplex group actions", () => {
  it("renames a group by display name", async () => {
    const result = await run("renameGroup", { to: "42", displayName: "Ops" });

    expect(client.updateGroupProfile).toHaveBeenCalledWith({
      groupId: 42,
      profile: { displayName: "Ops" },
    });
    expect(result?.details).toEqual({ ok: true, group: "42", displayName: "Ops" });
  });

  it("renames a group from a raw profile document", async () => {
    const result = await run("renameGroup", {
      groupId: "7",
      profile: '{"displayName":"Ops","description":"on call"}',
    });

    expect(client.updateGroupProfile).toHaveBeenCalledWith({
      groupId: 7,
      profile: { displayName: "Ops", description: "on call" },
    });
    expect(result?.details).toMatchObject({ ok: true, group: "7" });
  });

  it("rejects a profile document that is not JSON", async () => {
    await expect(run("renameGroup", { to: "42", profile: "{oops" })).rejects.toThrow(
      /Invalid profile JSON/
    );
  });

  it("requires a name when no profile document is given", async () => {
    await expect(run("renameGroup", { to: "42" })).rejects.toThrow(/displayName or name required/);
  });

  it("rejects a group reference the runtime API cannot address", async () => {
    await expect(run("renameGroup", { to: "#ops", displayName: "Ops" })).rejects.toThrow(
      /group id must be numeric/
    );
  });

  it("adds a participant", async () => {
    const result = await run("addParticipant", { to: "42", participant: "9" });

    expect(client.addGroupMember).toHaveBeenCalledWith({ groupId: 42, contactId: 9 });
    expect(result?.details).toEqual({ ok: true, group: "42", added: "9" });
  });

  it("requires a participant to add", async () => {
    await expect(run("addParticipant", { to: "42" })).rejects.toThrow(
      /participant or contactId required/
    );
  });

  it("rejects a non-numeric contact id", async () => {
    await expect(run("addParticipant", { to: "42", participant: "alice" })).rejects.toThrow(
      /group and contact ids must be numeric/
    );
  });

  it("removes a participant", async () => {
    const result = await run("removeParticipant", { to: "42", memberId: "5" });

    expect(client.removeGroupMember).toHaveBeenCalledWith({ groupId: 42, memberId: 5 });
    expect(result?.details).toEqual({ ok: true, group: "42", removed: "5" });
  });

  it("requires a participant to remove", async () => {
    await expect(run("removeParticipant", { to: "42" })).rejects.toThrow(
      /participant or memberId required/
    );
  });

  it("rejects a non-numeric member id", async () => {
    await expect(run("removeParticipant", { to: "42", participant: "alice" })).rejects.toThrow(
      /group and member ids must be numeric/
    );
  });

  it("leaves a group", async () => {
    const result = await run("leaveGroup", { to: "42" });

    expect(client.leaveGroup).toHaveBeenCalledWith(42);
    expect(result?.details).toEqual({ ok: true, group: "42", left: true });
  });

  it("rejects leaving a group the runtime API cannot address", async () => {
    await expect(run("leaveGroup", { to: "#ops" })).rejects.toThrow(/group id must be numeric/);
  });

  it("requires a group target", async () => {
    await expect(run("leaveGroup", {})).rejects.toThrow(/groupId or to required/);
  });

  it("returns null for an action it does not own", async () => {
    await expect(run("send", { to: "42" })).resolves.toBeNull();
  });
});
