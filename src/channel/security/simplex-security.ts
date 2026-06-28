import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveDefaultSimplexAccountId } from "../../config/accounts.js";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { describeSimplexWsEndpointSecurity } from "../../simplex/runtime/security.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexAllowlistEntry } from "../../types/security.js";
import { stripSimplexPrefix } from "../shared/simplex-common.js";

type SimplexAuditFinding = {
  checkId: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
  remediation?: string;
};

function normalizeSimplexId(value: string): string {
  return value.trim().toLowerCase();
}

export function parseSimplexAllowlistEntry(raw: string | number): SimplexAllowlistEntry | null {
  let entry = String(raw).trim();
  if (!entry) {
    return null;
  }
  if (entry === "*") {
    return { kind: "any", value: "*" };
  }
  entry = stripSimplexPrefix(entry);
  if (!entry) {
    return null;
  }
  const lowered = entry.toLowerCase();
  if (entry.startsWith("#")) {
    const value = entry.slice(1);
    return { kind: "group", value: normalizeSimplexId(value) };
  }
  if (lowered.startsWith("group:")) {
    const value = entry.slice("group:".length);
    return { kind: "group", value: normalizeSimplexId(value) };
  }
  if (entry.startsWith("@")) {
    const value = entry.slice(1);
    return { kind: "sender", value: normalizeSimplexId(value) };
  }
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    const value = entry.slice(entry.indexOf(":") + 1);
    return { kind: "sender", value: normalizeSimplexId(value) };
  }
  return { kind: "sender", value: normalizeSimplexId(entry) };
}

export function resolveSimplexAllowFrom(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): string[] {
  const accountId = params.accountId ?? resolveDefaultSimplexAccountId(params.cfg);
  const accountAllow = params.cfg.channels?.[SIMPLEX_CHANNEL_ID]?.accounts?.[accountId]?.allowFrom;
  const baseAllow = params.cfg.channels?.[SIMPLEX_CHANNEL_ID]?.allowFrom;
  const raw = Array.isArray(accountAllow) ? accountAllow : baseAllow;
  return normalizeSimplexAllowFrom(raw ?? []);
}

export function formatSimplexAllowFrom(allowFrom: Array<string | number>): string[] {
  return normalizeSimplexAllowFrom(allowFrom)
    .map((entry) => stripSimplexPrefix(entry))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toLowerCase());
}

function normalizeSimplexAllowFrom(allowFrom: Array<string | number>): string[] {
  return allowFrom.map((entry) => String(entry).trim()).filter(Boolean);
}

export function resolveSimplexDmPolicy(params: {
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
}): { policy: string; allowFrom: string[] } {
  const policy =
    params.account.config.dmPolicy ??
    params.cfg.channels?.[SIMPLEX_CHANNEL_ID]?.dmPolicy ??
    "pairing";
  const allowFrom = resolveSimplexAllowFrom({
    cfg: params.cfg,
    accountId: params.account.accountId,
  });
  return { policy, allowFrom };
}

export function isSimplexAllowlisted(params: {
  allowFrom: Array<string | number>;
  senderId?: string | null;
  groupId?: string | null;
  allowGroupId?: boolean;
}): boolean {
  const allowFrom = params.allowFrom ?? [];
  if (allowFrom.length === 0) {
    return false;
  }
  const senderParsed = params.senderId ? parseSimplexAllowlistEntry(String(params.senderId)) : null;
  const senderKey = senderParsed?.kind === "sender" ? senderParsed.value : "";
  const groupKey = params.groupId ? normalizeSimplexId(String(params.groupId)) : "";

  for (const raw of allowFrom) {
    const entry = parseSimplexAllowlistEntry(raw);
    if (!entry) {
      continue;
    }
    if (entry.kind === "any") {
      return true;
    }
    if (entry.kind === "sender") {
      if (senderKey && entry.value === senderKey) {
        return true;
      }
      continue;
    }
    if (entry.kind === "group" && params.allowGroupId) {
      if (groupKey && entry.value === groupKey) {
        return true;
      }
    }
  }
  return false;
}

export function collectSimplexSecurityAuditFindings(params: {
  account: ResolvedSimplexAccount;
  cfg: OpenClawConfig;
}): SimplexAuditFinding[] {
  const { account, cfg } = params;
  const findings: SimplexAuditFinding[] = [];
  const dmPolicy = account.config.dmPolicy ?? "pairing";
  const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";

  if (dmPolicy === "open") {
    findings.push({
      checkId: "simplex.dm-policy-open",
      severity: "warn",
      title: "SimpleX DMs accept any contact",
      detail: 'dmPolicy="open" lets any SimpleX contact reaching this account trigger the agent.',
      remediation:
        'Use dmPolicy="pairing" for invite-based approval or dmPolicy="allowlist" with allowFrom.',
    });
  }

  if (groupPolicy === "open") {
    findings.push({
      checkId: "simplex.group-policy-open",
      severity: "warn",
      title: "SimpleX groups accept any member",
      detail: 'groupPolicy="open" lets any member of a reachable SimpleX group trigger the agent.',
      remediation: 'Use groupPolicy="allowlist" and groupAllowFrom for specific groups/senders.',
    });
  }

  // The WebSocket endpoint audit only applies to the external runtime. In
  // native mode the core runs in-process, so there is no network endpoint to
  // assess (account.wsUrl is just an unused default).
  if (account.mode !== "native") {
    const endpoint = describeSimplexWsEndpointSecurity(account.wsUrl, {
      allowUnsafeRemoteWs: account.config.connection?.allowUnsafeRemoteWs,
    });
    for (const warning of endpoint.warnings) {
      findings.push({
        checkId:
          endpoint.blockingWarnings.length > 0
            ? "simplex.ws-endpoint-blocked"
            : "simplex.ws-endpoint-warning",
        severity: endpoint.blockingWarnings.length > 0 ? "critical" : "warn",
        title: "SimpleX WebSocket endpoint weakens transport privacy",
        detail: warning,
        remediation:
          "Prefer ws://127.0.0.1, a private sidecar network, or wss:// behind authenticated network controls.",
      });
    }
  }

  return findings;
}
