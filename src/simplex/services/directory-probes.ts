import { describeError } from "../../errors.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexClient } from "../runtime/client.js";
import { parseSimplexNumericId } from "../runtime/commands.js";

export type SimplexDirectoryProbeClient = Pick<SimplexClient, "getActiveUser">;

export type SimplexActiveUserInfo = {
  userId?: string;
  numericUserId: number | null;
  displayName?: string;
  raw?: unknown;
};

export const DEFAULT_SIMPLEX_DIRECTORY_TIMEOUT_MS = 5_000;

const ACTIVE_USER_CACHE_TTL_MS = 2_000;

type ActiveUserCacheEntry = {
  expiresAt: number;
  value: SimplexActiveUserInfo | null;
};

const activeUserCache = new Map<string, ActiveUserCacheEntry>();

export function clearSimplexDirectoryProbeCache(): void {
  activeUserCache.clear();
}

export function resolveSimplexDirectoryTimeoutMs(account: ResolvedSimplexAccount): number {
  return (
    account.config.connection?.directoryTimeoutMs ??
    account.config.connection?.commandTimeoutMs ??
    DEFAULT_SIMPLEX_DIRECTORY_TIMEOUT_MS
  );
}

export function isSimplexEmptyRuntimeListError(err: unknown): boolean {
  return describeError(err).trim().toLowerCase() === "failed reading: empty";
}

export function readSimplexStringId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

export function readSimplexActiveUserInfo(activeUser: unknown): SimplexActiveUserInfo | null {
  if (!activeUser || typeof activeUser !== "object") {
    return null;
  }
  const record = activeUser as Record<string, unknown>;
  const profile = (record.profile as Record<string, unknown> | undefined) ?? {};
  const userId = readSimplexStringId(record.userId ?? record.id ?? profile.userId);
  const displayName =
    readSimplexStringId(profile.displayName) ??
    readSimplexStringId(profile.fullName) ??
    readSimplexStringId(record.displayName);
  return {
    userId,
    numericUserId: userId === undefined ? null : parseSimplexNumericId(userId),
    displayName,
    raw: activeUser,
  };
}

export async function readSimplexActiveUserInfoFromClient(params: {
  account: ResolvedSimplexAccount;
  client: SimplexDirectoryProbeClient;
  timeoutMs?: number;
  cache?: boolean;
}): Promise<SimplexActiveUserInfo | null> {
  const useCache = params.cache ?? true;
  const cacheKey = activeUserCacheKey(params.account);
  const now = Date.now();
  if (useCache) {
    const cached = activeUserCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }
  }

  const timeoutMs = params.timeoutMs ?? resolveSimplexDirectoryTimeoutMs(params.account);
  const activeUser = await params.client.getActiveUser({ timeoutMs });
  const value = readSimplexActiveUserInfo(activeUser);

  if (useCache) {
    activeUserCache.set(cacheKey, {
      expiresAt: now + ACTIVE_USER_CACHE_TTL_MS,
      value,
    });
  }
  return value;
}

function activeUserCacheKey(account: ResolvedSimplexAccount): string {
  return `${account.accountId}\n${account.wsUrl}\n${
    account.config.connection?.directoryTimeoutMs ??
    account.config.connection?.commandTimeoutMs ??
    ""
  }`;
}
