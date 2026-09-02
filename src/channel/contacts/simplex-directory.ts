import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { ChannelDirectoryEntry } from "openclaw/plugin-sdk/directory-runtime";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { resolveSimplexAccount } from "../../config/accounts.js";
import { stripSimplexProviderPrefix } from "../../constants.js";
import { parseSimplexNumericId } from "../../simplex/runtime/api.js";
import { withSimplexClient } from "../../simplex/runtime/transport.js";
import {
  isSimplexEmptyRuntimeListError,
  readSimplexActiveUserInfoFromClient,
  readSimplexStringId,
  resolveSimplexDirectoryTimeoutMs,
  type SimplexActiveUserInfo,
  simplexErrorMessage,
} from "../../simplex/services/directory-probes.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";

type SimplexDirectoryParams = {
  cfg: OpenClawConfig;
  accountId?: string | null;
  runtime: RuntimeEnv;
};

type SimplexResolveResult = {
  input: string;
  resolved: boolean;
  id?: string;
  name?: string;
  note?: string;
};

function normalizeQuery(query?: string | null): string {
  return (query ?? "").trim().toLowerCase();
}

function applyDirectoryFilter(params: {
  entries: ChannelDirectoryEntry[];
  query?: string | null;
  limit?: number | null;
}): ChannelDirectoryEntry[] {
  const q = normalizeQuery(params.query);
  const filtered = q
    ? params.entries.filter(
        (entry) =>
          entry.id.toLowerCase().includes(q) || (entry.name?.toLowerCase().includes(q) ?? false)
      )
    : params.entries;
  const limit = params.limit && params.limit > 0 ? params.limit : undefined;
  return limit ? filtered.slice(0, limit) : filtered;
}

function isDirectoryEntry(entry: ChannelDirectoryEntry | null): entry is ChannelDirectoryEntry {
  return entry !== null;
}

function mapContactEntry(entry: unknown): ChannelDirectoryEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const contact = (record.contact as Record<string, unknown> | undefined) ?? record;
  const id = readSimplexStringId(contact.contactId ?? contact.id ?? record.contactId ?? record.id);
  if (!id) {
    return null;
  }
  const profile = (contact.profile as Record<string, unknown> | undefined) ?? {};
  const name =
    readSimplexStringId(contact.localDisplayName) ??
    readSimplexStringId(profile.displayName) ??
    readSimplexStringId(profile.fullName) ??
    readSimplexStringId(record.localDisplayName) ??
    undefined;
  return {
    kind: "user",
    id,
    name,
    raw: entry,
  };
}

function mapGroupEntry(entry: unknown): ChannelDirectoryEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const group =
    (record.groupInfo as Record<string, unknown> | undefined) ??
    (record.group as Record<string, unknown> | undefined) ??
    record;
  const id = readSimplexStringId(group.groupId ?? group.id ?? record.groupId ?? record.id);
  if (!id) {
    return null;
  }
  const profile =
    (group.groupProfile as Record<string, unknown> | undefined) ??
    (group.profile as Record<string, unknown> | undefined) ??
    {};
  const name =
    readSimplexStringId(group.localDisplayName) ??
    readSimplexStringId(profile.displayName) ??
    readSimplexStringId(profile.fullName) ??
    readSimplexStringId(record.localDisplayName) ??
    undefined;
  return {
    kind: "group",
    id,
    name,
    raw: entry,
  };
}

function mapMemberEntry(entry: unknown): ChannelDirectoryEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const record = entry as Record<string, unknown>;
  const member = (record.groupMember as Record<string, unknown> | undefined) ?? record;
  const id = readSimplexStringId(
    member.groupMemberId ??
      member.memberId ??
      member.contactId ??
      record.groupMemberId ??
      record.memberId
  );
  if (!id) {
    return null;
  }
  const profile = (member.profile as Record<string, unknown> | undefined) ?? {};
  const name =
    readSimplexStringId(member.localDisplayName) ??
    readSimplexStringId(profile.displayName) ??
    readSimplexStringId(profile.fullName) ??
    undefined;
  return {
    kind: "user",
    id,
    name,
    raw: entry,
  };
}

function normalizeSimplexInputId(input: string): { id: string; explicit: boolean } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { id: "", explicit: false };
  }
  const withoutPrefix = stripSimplexProviderPrefix(trimmed);
  const lowered = withoutPrefix.toLowerCase();
  if (lowered.startsWith("#")) {
    return { id: withoutPrefix.slice(1).trim(), explicit: true };
  }
  if (lowered.startsWith("@")) {
    return { id: withoutPrefix.slice(1).trim(), explicit: true };
  }
  if (lowered.startsWith("group:")) {
    return { id: withoutPrefix.slice("group:".length).trim(), explicit: true };
  }
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    return { id: withoutPrefix.slice(withoutPrefix.indexOf(":") + 1).trim(), explicit: true };
  }
  return { id: withoutPrefix, explicit: false };
}

function normalizeSimplexDirectoryQuery(query?: string | null): string | undefined {
  const raw = query?.trim();
  if (!raw) {
    return undefined;
  }
  const { id, explicit } = normalizeSimplexInputId(raw);
  if (explicit && id) {
    return id;
  }
  return stripSimplexProviderPrefix(raw);
}

function readDirectoryIdCandidate(query?: string | null): string | null {
  const raw = query?.trim();
  if (!raw) {
    return null;
  }
  const stripped = stripSimplexProviderPrefix(raw);
  const normalized = normalizeSimplexInputId(raw);
  if (normalized.explicit && normalized.id) {
    return normalized.id;
  }
  if (stripped !== raw && stripped) {
    return stripped;
  }
  return parseSimplexNumericId(stripped) === null ? null : stripped;
}

async function fetchActiveUserInfo(
  account: ResolvedSimplexAccount,
  runtime: RuntimeEnv
): Promise<SimplexActiveUserInfo | null> {
  const timeoutMs = resolveSimplexDirectoryTimeoutMs(account);
  try {
    return await withSimplexClient({
      account,
      run: async (client) =>
        await readSimplexActiveUserInfoFromClient({ account, client, timeoutMs }),
    });
  } catch (err) {
    runtime.error?.(`simplex: failed to read active user: ${simplexErrorMessage(err)}`);
    return null;
  }
}

async function listContactsLive(params: {
  account: ResolvedSimplexAccount;
  runtime: RuntimeEnv;
  query?: string | null;
  limit?: number | null;
}): Promise<ChannelDirectoryEntry[]> {
  const timeoutMs = resolveSimplexDirectoryTimeoutMs(params.account);
  return await withSimplexClient({
    account: params.account,
    run: async (client) => {
      const activeUser = await readSimplexActiveUserInfoFromClient({
        account: params.account,
        client,
        timeoutMs,
      });
      const userId = activeUser?.numericUserId ?? null;
      if (userId === null) {
        return [];
      }
      const query = normalizeSimplexDirectoryQuery(params.query);
      const contacts = await client.listContacts(userId, { timeoutMs }).catch((err): unknown[] => {
        if (isSimplexEmptyRuntimeListError(err)) {
          return [];
        }
        throw err;
      });
      const mapped = contacts.map(mapContactEntry).filter(isDirectoryEntry);
      return applyDirectoryFilter({
        entries: mapped,
        query,
        limit: params.limit,
      });
    },
  });
}

async function listGroupsLive(params: {
  account: ResolvedSimplexAccount;
  runtime: RuntimeEnv;
  query?: string | null;
  limit?: number | null;
}): Promise<ChannelDirectoryEntry[]> {
  const timeoutMs = resolveSimplexDirectoryTimeoutMs(params.account);
  return await withSimplexClient({
    account: params.account,
    run: async (client) => {
      const activeUser = await readSimplexActiveUserInfoFromClient({
        account: params.account,
        client,
        timeoutMs,
      });
      const userId = activeUser?.numericUserId ?? null;
      if (userId === null) {
        return [];
      }
      const query = normalizeSimplexDirectoryQuery(params.query);
      const groups = await client
        .listGroups({ userId, search: query }, { timeoutMs })
        .catch((err): unknown[] => {
          if (isSimplexEmptyRuntimeListError(err)) {
            return [];
          }
          throw err;
        });
      const mapped = groups.map(mapGroupEntry).filter(isDirectoryEntry);
      return applyDirectoryFilter({
        entries: mapped,
        query,
        limit: params.limit,
      });
    },
  });
}

async function listGroupMembersLive(params: {
  account: ResolvedSimplexAccount;
  runtime: RuntimeEnv;
  groupId: string;
  limit?: number | null;
}): Promise<ChannelDirectoryEntry[]> {
  const groupId = parseSimplexNumericId(params.groupId);
  if (groupId === null) {
    return [];
  }
  const timeoutMs = resolveSimplexDirectoryTimeoutMs(params.account);
  return await withSimplexClient({
    account: params.account,
    run: async (client) => {
      const members = await client
        .listGroupMembers({ groupId }, { timeoutMs })
        .catch((err): unknown[] => {
          if (isSimplexEmptyRuntimeListError(err)) {
            return [];
          }
          throw err;
        });
      return applyDirectoryFilter({
        entries: members.map(mapMemberEntry).filter(isDirectoryEntry),
        limit: params.limit,
      });
    },
  });
}

export async function resolveSimplexSelf(
  params: SimplexDirectoryParams
): Promise<ChannelDirectoryEntry | null> {
  const account = resolveSimplexAccount(params);
  if (!account.configured) {
    return null;
  }
  const activeUser = await fetchActiveUserInfo(account, params.runtime);
  if (!activeUser?.userId) {
    return null;
  }
  return {
    kind: "user",
    id: activeUser.userId,
    name: activeUser.displayName,
    raw: activeUser.raw,
  };
}

export async function listSimplexDirectoryPeers(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
  runtime: RuntimeEnv;
}): Promise<ChannelDirectoryEntry[]> {
  const account = resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    return [];
  }
  const id = readDirectoryIdCandidate(params.query);
  if (id) {
    return [{ kind: "user", id }];
  }
  return await listContactsLive({
    account,
    runtime: params.runtime,
    query: params.query,
    limit: params.limit,
  });
}

export async function listSimplexDirectoryGroups(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
  runtime: RuntimeEnv;
}): Promise<ChannelDirectoryEntry[]> {
  const account = resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    return [];
  }
  const id = readDirectoryIdCandidate(params.query);
  if (id) {
    return [{ kind: "group", id }];
  }
  return await listGroupsLive({
    account,
    runtime: params.runtime,
    query: params.query,
    limit: params.limit,
  });
}

export async function listSimplexGroupMembers(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  groupId: string;
  limit?: number | null;
  runtime: RuntimeEnv;
}): Promise<ChannelDirectoryEntry[]> {
  const account = resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    return [];
  }
  return await listGroupMembersLive({
    account,
    runtime: params.runtime,
    groupId: params.groupId,
    limit: params.limit,
  });
}

export async function resolveSimplexTargets(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
  inputs: string[];
  kind: "user" | "group";
  runtime: RuntimeEnv;
}): Promise<SimplexResolveResult[]> {
  const account = resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    return params.inputs.map((input) => ({
      input,
      resolved: false,
      note: "simplex account not configured",
    }));
  }
  const direct = new Map<string, SimplexResolveResult>();
  for (const input of params.inputs) {
    const id = readDirectoryIdCandidate(input);
    if (id) {
      direct.set(input, {
        input,
        resolved: true,
        id,
        note: "treated as explicit id",
      });
    }
  }
  if (direct.size === params.inputs.length) {
    return params.inputs.map((input) => direct.get(input) ?? { input, resolved: false });
  }

  const entries =
    params.kind === "group"
      ? await listGroupsLive({ account, runtime: params.runtime })
      : await listContactsLive({ account, runtime: params.runtime });
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  return params.inputs.map((input) => {
    const directMatch = direct.get(input);
    if (directMatch) {
      return directMatch;
    }
    const { id, explicit } = normalizeSimplexInputId(input);
    if (explicit && id) {
      const match = byId.get(id);
      return {
        input,
        resolved: true,
        id,
        name: match?.name,
        note: match ? undefined : "treated as explicit id",
      };
    }
    if (id && byId.has(id)) {
      const match = byId.get(id);
      return {
        input,
        resolved: true,
        id,
        name: match?.name,
      };
    }
    const needle = normalizeQuery(input);
    if (!needle) {
      return { input, resolved: false };
    }
    const matches = entries.filter((entry) => (entry.name ?? "").toLowerCase().includes(needle));
    if (matches.length === 1) {
      const only = matches[0];
      if (!only) {
        return { input, resolved: false };
      }
      return {
        input,
        resolved: true,
        id: only.id,
        name: only.name,
      };
    }
    if (matches.length > 1) {
      return {
        input,
        resolved: false,
        note: `multiple matches (${matches.length})`,
      };
    }
    return {
      input,
      resolved: false,
      note: "not found",
    };
  });
}
