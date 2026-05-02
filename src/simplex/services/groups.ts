import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { SimplexApiGroupMemberRole, SimplexApiGroupProfile } from "../../types/simplex.js";
import { resolveRuntimeAccount, withActiveSimplexUser } from "../runtime/account.js";

const GROUP_MEMBER_ROLES = new Set(["observer", "author", "member", "moderator", "admin", "owner"]);

function readRole(value: unknown, fallback: string): SimplexApiGroupMemberRole {
  const role = typeof value === "string" ? value.trim().toLowerCase() : fallback;
  if (!GROUP_MEMBER_ROLES.has(role)) {
    throw new Error(`role must be one of ${[...GROUP_MEMBER_ROLES].join(", ")}`);
  }
  return role as SimplexApiGroupMemberRole;
}

function readGroupId(value: unknown): number {
  const groupId = typeof value === "number" ? value : Number(String(value ?? "").trim());
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

export async function createSimplexGroup(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  displayName: string;
  fullName?: string;
  description?: string;
}): Promise<{ accountId: string; group: unknown }> {
  const displayName = params.displayName.trim();
  if (!displayName) {
    throw new Error("displayName is required");
  }
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const profile: SimplexApiGroupProfile = {
    displayName,
    fullName: params.fullName?.trim() ?? "",
    description: params.description?.trim() || undefined,
  };
  const group = await withActiveSimplexUser({
    account,
    run: (userId, api) => api.apiNewGroup(userId, profile),
  });
  return { accountId: account.accountId, group };
}

export async function createSimplexGroupLink(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  groupId: unknown;
  role?: unknown;
}): Promise<{ accountId: string; groupId: number; role: SimplexApiGroupMemberRole; link: string }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readGroupId(params.groupId);
  const role = readRole(params.role, "member");
  const link = await withActiveSimplexUser({
    account,
    run: (_userId, api) => api.apiCreateGroupLink(groupId, role),
  });
  return { accountId: account.accountId, groupId, role, link };
}

export async function listSimplexGroupLink(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  groupId: unknown;
}): Promise<{ accountId: string; groupId: number; link: string | null; linkInfo: unknown }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readGroupId(params.groupId);
  const result = await withActiveSimplexUser({
    account,
    run: async (_userId, api) => {
      const [link, linkInfo] = await Promise.all([
        api.apiGetGroupLinkStr(groupId),
        api.apiGetGroupLink(groupId).catch(() => null),
      ]);
      return { link, linkInfo };
    },
  });
  return {
    accountId: account.accountId,
    groupId,
    link: linkToString(result.link),
    linkInfo: result.linkInfo,
  };
}

export async function revokeSimplexGroupLink(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  groupId: unknown;
}): Promise<{ accountId: string; groupId: number; revoked: boolean }> {
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const groupId = readGroupId(params.groupId);
  await withActiveSimplexUser({
    account,
    run: (_userId, api) => api.apiDeleteGroupLink(groupId),
  });
  return { accountId: account.accountId, groupId, revoked: true };
}
