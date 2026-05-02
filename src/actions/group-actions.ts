import type { ChannelMessageActionName } from "openclaw/plugin-sdk/channel-contract";
import { parseSimplexNumericId } from "../simplex/runtime/api.js";
import { withSimplexApi } from "../simplex/runtime/transport.js";
import type { SimplexActionParams, ToolResult } from "../types/actions.js";
import type { ResolvedSimplexAccount } from "../types/config.js";
import type { SimplexApiGroupMemberRole, SimplexApiGroupProfile } from "../types/simplex.js";
import { normalizeSimplexGroupRef, readGroupTarget, readStringParam } from "./params.js";
import { jsonResult } from "./result.js";

export async function executeSimplexGroupAction(params: {
  action: ChannelMessageActionName;
  account: ResolvedSimplexAccount;
  toolParams: SimplexActionParams;
}): Promise<ToolResult | null> {
  const { action, account, toolParams } = params;

  if (action === "renameGroup") {
    const target = readGroupTarget(toolParams);
    const rawProfile =
      readStringParam(toolParams, "profile") ?? readStringParam(toolParams, "groupProfile");
    if (rawProfile) {
      let profile: Record<string, unknown>;
      try {
        profile = JSON.parse(rawProfile) as Record<string, unknown>;
      } catch (err) {
        throw new Error(`Invalid profile JSON: ${String(err)}`, { cause: err });
      }
      const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
      if (groupId === null) {
        throw new Error(`SimpleX group id must be numeric for runtime API: ${target}`);
      }
      await withSimplexApi({
        account,
        run: (api) =>
          api.apiUpdateGroupProfile(groupId, profile as unknown as SimplexApiGroupProfile),
      });
      return jsonResult({ ok: true, group: target, profile });
    }
    const displayName =
      readStringParam(toolParams, "displayName") ??
      readStringParam(toolParams, "name") ??
      readStringParam(toolParams, "title");
    if (!displayName) {
      throw new Error("displayName or name required");
    }
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    if (groupId === null) {
      throw new Error(`SimpleX group id must be numeric for runtime API: ${target}`);
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiUpdateGroupProfile(groupId, { displayName } as SimplexApiGroupProfile),
    });
    return jsonResult({ ok: true, group: target, displayName });
  }

  if (action === "addParticipant") {
    const target = readGroupTarget(toolParams);
    const participant =
      readStringParam(toolParams, "participant") ??
      readStringParam(toolParams, "contactId") ??
      readStringParam(toolParams, "memberId");
    if (!participant) {
      throw new Error("participant or contactId required");
    }
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    const contactId = parseSimplexNumericId(participant);
    if (groupId === null || contactId === null) {
      throw new Error("SimpleX group and contact ids must be numeric for runtime API");
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiAddMember(groupId, contactId, "member" as SimplexApiGroupMemberRole),
    });
    return jsonResult({ ok: true, group: target, added: participant });
  }

  if (action === "removeParticipant") {
    const target = readGroupTarget(toolParams);
    const participant =
      readStringParam(toolParams, "participant") ??
      readStringParam(toolParams, "memberId") ??
      readStringParam(toolParams, "contactId");
    if (!participant) {
      throw new Error("participant or memberId required");
    }
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    const memberId = parseSimplexNumericId(participant);
    if (groupId === null || memberId === null) {
      throw new Error("SimpleX group and member ids must be numeric for runtime API");
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiRemoveMembers(groupId, [memberId]),
    });
    return jsonResult({ ok: true, group: target, removed: participant });
  }

  if (action === "leaveGroup") {
    const target = readGroupTarget(toolParams);
    const groupId = parseSimplexNumericId(normalizeSimplexGroupRef(target));
    if (groupId === null) {
      throw new Error(`SimpleX group id must be numeric for runtime API: ${target}`);
    }
    await withSimplexApi({
      account,
      run: (api) => api.apiLeaveGroup(groupId),
    });
    return jsonResult({ ok: true, group: target, left: true });
  }

  return null;
}
