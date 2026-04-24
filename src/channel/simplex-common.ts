import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import type { ChannelGroupContext } from "openclaw/plugin-sdk/channel-contract";
import type { GroupToolPolicyConfig } from "openclaw/plugin-sdk/channel-policy";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";
import { stripSimplexProviderPrefix } from "../constants.js";

export { DEFAULT_ACCOUNT_ID };

export type SimplexExplicitTarget = {
  to: string;
  chatType: "direct" | "group";
};

type SimplexTargetKind = SimplexExplicitTarget["chatType"] | null;

export function extractSimplexWsUrlFromApplication(application: unknown): string | undefined {
  if (!application || typeof application !== "object") {
    return undefined;
  }
  const value = (application as { wsUrl?: unknown }).wsUrl;
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

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

export function normalizeSimplexMessageId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

export function stripSimplexPrefix(value: string): string {
  return stripSimplexProviderPrefix(value);
}

export function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

function readPrefixedSimplexTarget(raw: string): { value: string; kind: SimplexTargetKind } {
  const strippedProvider = stripSimplexPrefix(raw);
  const lower = strippedProvider.toLowerCase();
  if (lower.startsWith("group:")) {
    return { value: strippedProvider.slice("group:".length).trim(), kind: "group" };
  }
  if (lower.startsWith("contact:") || lower.startsWith("user:") || lower.startsWith("member:")) {
    return {
      value: strippedProvider.slice(strippedProvider.indexOf(":") + 1).trim(),
      kind: "direct",
    };
  }
  return { value: strippedProvider, kind: null };
}

export function parseSimplexExplicitTarget(raw: string): SimplexExplicitTarget | null {
  const { value, kind } = readPrefixedSimplexTarget(raw);
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
  if (kind === "group") {
    return { to: `#${value}`, chatType: "group" };
  }
  if (kind === "direct") {
    return { to: `@${value}`, chatType: "direct" };
  }
  return null;
}

export function inferSimplexTargetChatType(
  raw: string
): SimplexExplicitTarget["chatType"] | undefined {
  return parseSimplexExplicitTarget(raw)?.chatType;
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
