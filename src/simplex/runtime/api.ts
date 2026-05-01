import { stripSimplexProviderPrefix } from "../../constants.js";
import type {
  SimplexApiChatRef,
  SimplexApiChatType,
  SimplexApiNumericChatRef,
  SimplexChatRef,
} from "../../types/simplex.js";

export function formatSimplexChatRef(ref: SimplexChatRef): string {
  if (ref.type === "local") {
    throw new Error("local SimpleX chat refs are not supported");
  }
  if (ref.scope) {
    throw new Error("scoped SimpleX chat refs are not supported");
  }
  const prefix = ref.type === "direct" ? "@" : "#";
  return `${prefix}${ref.id}`;
}

export function parseSimplexApiChatRef(value: string): SimplexApiNumericChatRef | null {
  const raw = stripSimplexProviderPrefix(value.trim());
  if (!raw) {
    return null;
  }
  const lowered = raw.toLowerCase();
  if (raw.startsWith("#") || lowered.startsWith("group:")) {
    const id = Number.parseInt(raw.startsWith("#") ? raw.slice(1) : raw.slice("group:".length), 10);
    return Number.isFinite(id) ? ["group", id] : null;
  }
  if (
    raw.startsWith("@") ||
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    const body = raw.startsWith("@") ? raw.slice(1) : raw.slice(raw.indexOf(":") + 1);
    const id = Number.parseInt(body, 10);
    return Number.isFinite(id) ? ["direct", id] : null;
  }
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) ? ["direct", id] : null;
}

export function toSimplexApiChatRef(ref: SimplexApiNumericChatRef): SimplexApiChatRef {
  return ref as unknown as SimplexApiChatRef;
}

export function toSimplexApiChatType(ref: SimplexApiNumericChatRef): SimplexApiChatType {
  return ref[0] as unknown as SimplexApiChatType;
}

export function parseSimplexNumericId(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : null;
  }
  const raw = stripSimplexProviderPrefix(value.trim());
  const normalized = raw.startsWith("@")
    ? raw.slice(1)
    : raw.startsWith("#")
      ? raw.slice(1)
      : raw.includes(":")
        ? raw.slice(raw.indexOf(":") + 1)
        : raw;
  const id = Number.parseInt(normalized, 10);
  return Number.isFinite(id) ? id : null;
}

export function resolveSimplexChatItemId(chatItem: unknown): string | undefined {
  const item = chatItem as { chatItem?: { meta?: { itemId?: unknown } } } | undefined;
  const raw = item?.chatItem?.meta?.itemId;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(raw);
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return undefined;
}
