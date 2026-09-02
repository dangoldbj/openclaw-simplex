import type { SimplexAccountScope } from "../../types/config.js";
import type { SimplexGroupMemberRole, SimplexGroupProfile } from "../../types/simplex.js";
import { resolveRuntimeAccount, withActiveSimplexUser } from "../runtime/account.js";

const GROUP_MEMBER_ROLES = new Set(["observer", "author", "member", "moderator", "admin", "owner"]);

function readRole(value: unknown, fallback: string): SimplexGroupMemberRole {
  const role = typeof value === "string" ? value.trim().toLowerCase() : fallback;
  if (!GROUP_MEMBER_ROLES.has(role)) {
    throw new Error(`role must be one of ${[...GROUP_MEMBER_ROLES].join(", ")}`);
  }
  return role as SimplexGroupMemberRole;
}

function readGroupId(value: unknown): number {
  const groupId =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^[0-9]+$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new Error("groupId must be a positive integer");
  }
  return groupId;
}

function linkToString(link: unknown): string | null {
  if (typeof link === "string" && link.trim()) {
    return link;
  }
  if (!link || typeof link !== "object") {
    return null;
  }
  const record = link as Record<string, unknown>;
  const nested = (record.connLinkContact as Record<string, unknown> | undefined) ?? record;
  const short = nested.connShortLink;
  const full = nested.connFullLink;
  return typeof short === "string" && short
    ? short
    : typeof full === "string" && full
      ? full
      : null;
}

export async function createSimplexGroup(
  params: SimplexAccountScope & {
    displayName: string;
    fullName?: string;
    description?: string;
  }
): Promise<{ accountId: string; group: unknown }> {
  const displayName = params.displayName.trim();
  if (!displayName) {
    throw new Error("displayName is required");
  }
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const profile: SimplexGroupProfile = {
    displayName,
    fullName: params.fullName?.trim() ?? "",
    description: params.description?.trim() || undefined,
  };
  const group = await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.createGroup(profile),
  });
  return { accountId: account.accountId, group };
}

export async function createSimplexGroupLink(
  params: SimplexAccountScope & {
    groupId: unknown;
    role?: unknown;
  }
): Promise<{ accountId: string; groupId: number; role: SimplexGroupMemberRole; link: string }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readGroupId(params.groupId);
  const role = readRole(params.role, "member");
  const result = await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.createGroupLink({ groupId, role }),
  });
  return { accountId: account.accountId, groupId, role, link: result.link ?? "" };
}

export async function listSimplexGroupLink(
  params: SimplexAccountScope & {
    groupId: unknown;
  }
): Promise<{ accountId: string; groupId: number; link: string | null; linkInfo: unknown }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readGroupId(params.groupId);
  const result = await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.getGroupLink(groupId),
  });
  return {
    accountId: account.accountId,
    groupId,
    link: linkToString(result.link),
    linkInfo: result.response,
  };
}

export async function revokeSimplexGroupLink(
  params: SimplexAccountScope & {
    groupId: unknown;
  }
): Promise<{ accountId: string; groupId: number; revoked: boolean }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readGroupId(params.groupId);
  await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.deleteGroupLink(groupId),
  });
  return { accountId: account.accountId, groupId, revoked: true };
}
