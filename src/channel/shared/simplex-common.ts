import type { ChannelGroupContext } from "openclaw/plugin-sdk/channel-contract";
import type { GroupToolPolicyConfig } from "openclaw/plugin-sdk/channel-policy";
import {
  normalizeOptionalString,
  normalizeOptionalStringifiedId,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import { resolveSimplexAccount } from "../../config/accounts.js";
import { stripSimplexProviderPrefix } from "../../constants.js";
import {
  normalizeSimplexContactRef,
  readMarkedSimplexRef,
  SIMPLEX_REF_SIGILS,
} from "../../simplex/chat-ref.js";
import type { SimplexExplicitTarget, SimplexTargetKind } from "../../types/channel.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";

export function resolveSimplexHealthState(params: {
  configured: boolean;
  running?: boolean;
  connected?: boolean;
  lastError?: string | null;
}): string {
  const lastError = params.lastError?.trim();
  if (lastError) {
    return "error";
  }
  if (params.connected) {
    return "healthy";
  }
  if (params.running) {
    return "starting";
  }
  if (params.configured) {
    return "ready";
  }
  return "idle";
}

export { normalizeSimplexContactRef };

export function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

/**
 * Splits a raw target into its spelled-out kind and remaining value.
 *
 * Only the word prefixes (`group:`, `contact:`, ...) resolve a kind here; a bare
 * sigil is left on `value` because `parseSimplexExplicitTarget` distinguishes
 * those cases itself. The prefix table lives in `simplex/chat-ref`.
 */
function readPrefixedSimplexTarget(raw: string): {
  value: string;
  kind: SimplexTargetKind;
  hadProviderPrefix: boolean;
} {
  const strippedProvider = stripSimplexProviderPrefix(raw);
  const hadProviderPrefix = strippedProvider !== raw.trim();
  const marked = readMarkedSimplexRef(strippedProvider);
  if (marked && !SIMPLEX_REF_SIGILS.includes(strippedProvider.slice(0, 1))) {
    return { value: marked.id, kind: marked.kind, hadProviderPrefix };
  }
  return { value: strippedProvider, kind: null, hadProviderPrefix };
}

export function parseSimplexExplicitTarget(raw: string): SimplexExplicitTarget | null {
  const { value, kind, hadProviderPrefix } = readPrefixedSimplexTarget(raw);
  if (!value) {
    return null;
  }
  if (value.startsWith("#")) {
    const id = value.slice(1).trim();
    return id ? { to: `#${id}`, chatType: "group" } : null;
  }
  if (value.startsWith("@")) {
    const id = value.slice(1).trim();
    return id ? { to: `@${id}`, chatType: "direct" } : null;
  }
  if (value.startsWith("!")) {
    const id = value.slice(1).trim();
    return id ? { to: `!${id}`, chatType: "channel" } : null;
  }
  if (kind === "group") {
    return { to: `#${value}`, chatType: "group" };
  }
  if (kind === "direct") {
    return { to: `@${value}`, chatType: "direct" };
  }
  if (kind === "channel") {
    return { to: value.startsWith("!") ? value : `!${value}`, chatType: "channel" };
  }
  if (hadProviderPrefix) {
    return { to: `@${value}`, chatType: "direct" };
  }
  return null;
}

export function resolveSimplexRouteTarget(params: {
  rawTarget?: string | null;
  accountId?: string | null;
  fallbackThreadId?: string | number | null;
}): {
  to: string;
  accountId?: string;
  threadId?: string;
  chatType?: "direct" | "group" | "channel";
} | null {
  // The SimpleX grammar is applied here rather than through the SDK's
  // `resolveChannelRouteTargetWithParser`: that helper is deprecated in
  // 2026.7.x and gone from `openclaw/plugin-sdk/channel-route` in 2026.8.x.
  const rawTo = normalizeOptionalString(params.rawTarget);
  if (!rawTo) {
    return null;
  }
  const parsed = parseSimplexExplicitTarget(rawTo);
  return {
    to: parsed?.to ?? rawTo,
    accountId: params.accountId ?? undefined,
    threadId: normalizeOptionalStringifiedId(params.fallbackThreadId),
    chatType:
      parsed?.chatType === "group"
        ? "group"
        : parsed?.chatType === "channel"
          ? "channel"
          : "direct",
  };
}

export function inferSimplexTargetChatType(
  raw: string
): SimplexExplicitTarget["chatType"] | undefined {
  return parseSimplexExplicitTarget(raw)?.chatType;
}

export function looksLikeSimplexExplicitTarget(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }
  if (parseSimplexExplicitTarget(trimmed)) {
    return true;
  }
  const strippedProvider = stripSimplexProviderPrefix(trimmed);
  return strippedProvider !== trimmed && strippedProvider.trim().length > 0;
}

export function formatSimplexTargetDisplay(params: {
  target: string;
  display?: string;
  kind?: string;
}): string {
  const display = params.display?.trim();
  if (display) {
    return display;
  }
  const parsed = parseSimplexExplicitTarget(params.target);
  if (parsed) {
    return parsed.to;
  }
  const { value } = readPrefixedSimplexTarget(params.target);
  if (!value) {
    return value;
  }
  if (params.kind === "group") {
    return value.startsWith("#") ? value : `#${value}`;
  }
  if (params.kind === "channel") {
    return value.startsWith("!") ? value : `!${value}`;
  }
  if (params.kind === "user") {
    return value.startsWith("@") ? value : `@${value}`;
  }
  return value;
}

export function assertSimplexOutboundAccountReady(account: ResolvedSimplexAccount): void {
  if (!account.enabled) {
    throw new Error(`SimpleX account "${account.accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${account.accountId}" is not configured`);
  }
}

/**
 * Per-group `requireMention` lookup: an exact group entry wins over the `"*"`
 * fallback, and `undefined` means neither was configured.
 *
 * Callers apply their own default, which is why this returns `undefined` rather
 * than a boolean. The channel adapter passes the absence through to the host,
 * while the inbound auth path treats an unset value as "mention required".
 * Keeping the precedence in one place stops those two from drifting apart.
 */
export function readSimplexGroupRequireMention(params: {
  account: ResolvedSimplexAccount;
  groupId?: string | null;
}): boolean | undefined {
  const groups = params.account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const entry = groupId ? groups[groupId] : undefined;
  const fallback = groups["*"];
  if (typeof entry?.requireMention === "boolean") {
    return entry.requireMention;
  }
  if (typeof fallback?.requireMention === "boolean") {
    return fallback.requireMention;
  }
  return undefined;
}

export function resolveSimplexGroupRequireMention(
  params: ChannelGroupContext
): boolean | undefined {
  return readSimplexGroupRequireMention({
    account: resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId }),
    groupId: params.groupId,
  });
}

export function resolveSimplexGroupToolPolicy(
  params: ChannelGroupContext
): GroupToolPolicyConfig | undefined {
  const account = resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId });
  const groups = account.config.groups ?? {};
  const groupId = params.groupId?.trim();
  const candidates = [groupId, "*"].filter((value): value is string => Boolean(value));
  for (const key of candidates) {
    const entry = groups[key];
    if (entry?.tools) {
      return entry.tools;
    }
  }
  return undefined;
}
