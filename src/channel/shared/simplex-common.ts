import type { ChannelGroupContext } from "openclaw/plugin-sdk/channel-contract";
import type { GroupToolPolicyConfig } from "openclaw/plugin-sdk/channel-policy";
import {
  normalizeOptionalString,
  normalizeOptionalStringifiedId,
} from "openclaw/plugin-sdk/string-coerce-runtime";
import { resolveSimplexAccount } from "../../config/accounts.js";
import { stripSimplexProviderPrefix } from "../../constants.js";
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

export function stripSimplexPrefix(value: string): string {
  return stripSimplexProviderPrefix(value);
}

export function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

function readPrefixedSimplexTarget(raw: string): {
  value: string;
  kind: SimplexTargetKind;
  hadProviderPrefix: boolean;
} {
  const strippedProvider = stripSimplexPrefix(raw);
  const hadProviderPrefix = strippedProvider !== raw.trim();
  const lower = strippedProvider.toLowerCase();
  if (lower.startsWith("group:")) {
    return {
      value: strippedProvider.slice("group:".length).trim(),
      kind: "group",
      hadProviderPrefix,
    };
  }
  if (lower.startsWith("channel:")) {
    return {
      value: strippedProvider.slice("channel:".length).trim(),
      kind: "channel",
      hadProviderPrefix,
    };
  }
  if (lower.startsWith("contact:") || lower.startsWith("user:") || lower.startsWith("member:")) {
    return {
      value: strippedProvider.slice(strippedProvider.indexOf(":") + 1).trim(),
      kind: "direct",
      hadProviderPrefix,
    };
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
  const strippedProvider = stripSimplexPrefix(trimmed);
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

export function normalizeSimplexContactRef(value: string): string {
  const trimmed = stripSimplexPrefix(value);
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("@")) {
    return trimmed;
  }
  const lowered = trimmed.toLowerCase();
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    return `@${trimmed.slice(trimmed.indexOf(":") + 1).trim()}`;
  }
  return `@${trimmed}`;
}

export function assertSimplexOutboundAccountReady(account: ResolvedSimplexAccount): void {
  if (!account.enabled) {
    throw new Error(`SimpleX account "${account.accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${account.accountId}" is not configured`);
  }
}

export function resolveSimplexGroupRequireMention(
  params: ChannelGroupContext
): boolean | undefined {
  const account = resolveSimplexAccount({ cfg: params.cfg, accountId: params.accountId });
  const groups = account.config.groups ?? {};
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
