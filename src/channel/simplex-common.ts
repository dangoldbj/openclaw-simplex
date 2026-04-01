import { DEFAULT_ACCOUNT_ID, formatPairingApproveHint } from "openclaw/plugin-sdk/core";
import type { ChannelGroupContext } from "openclaw/plugin-sdk/channel-contract";
import type { GroupToolPolicyConfig } from "openclaw/plugin-sdk/channel-policy";
import { resolveSimplexAccount } from "../config/accounts.js";
import type { ResolvedSimplexAccount } from "../config/types.js";

export { DEFAULT_ACCOUNT_ID, formatPairingApproveHint };

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
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("openclaw-simplex:")) {
    return trimmed.slice("openclaw-simplex:".length).trim();
  }
  return lower.startsWith("simplex:") ? trimmed.slice("simplex:".length).trim() : trimmed;
}

export function stripLeadingAt(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed.slice(1).trim() : trimmed;
}

export function normalizeSimplexContactRef(value: string): string {
  const trimmed = value.trim();
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
    lowered.startsWith("member:") ||
    lowered.startsWith("simplex:") ||
    lowered.startsWith("openclaw-simplex:")
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
