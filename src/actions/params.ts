import type { DeleteMode, SimplexActionParams } from "./types.js";

export function readStringParam(
  params: SimplexActionParams,
  key: string,
  options: { required?: boolean; allowEmpty?: boolean } = {}
): string | undefined {
  const raw = params[key];
  if (typeof raw !== "string") {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  const value = raw.trim();
  if (!value && !options.allowEmpty) {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  return value;
}

export function readNumberParam(
  params: SimplexActionParams,
  key: string,
  options: { required?: boolean; integer?: boolean } = {}
): number | undefined {
  const raw = params[key];
  let value: number | undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    value = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) {
        value = parsed;
      }
    }
  }
  if (value === undefined) {
    if (options.required) {
      throw new Error(`${key} required`);
    }
    return undefined;
  }
  return options.integer ? Math.trunc(value) : value;
}

export function normalizeSimplexChatRef(raw: string, chatType?: string | null): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  const withoutPrefix = lower.startsWith("openclaw-simplex:")
    ? trimmed.slice("openclaw-simplex:".length).trim()
    : lower.startsWith("simplex:")
      ? trimmed.slice("simplex:".length).trim()
      : trimmed;
  if (!withoutPrefix) {
    return withoutPrefix;
  }
  if (withoutPrefix.startsWith("@") || withoutPrefix.startsWith("#")) {
    return withoutPrefix;
  }
  const lowered = withoutPrefix.toLowerCase();
  if (lowered.startsWith("group:")) {
    const id = withoutPrefix.slice("group:".length).trim();
    return id ? `#${id}` : withoutPrefix;
  }
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    const id = withoutPrefix.slice(withoutPrefix.indexOf(":") + 1).trim();
    return id ? `@${id}` : withoutPrefix;
  }
  if (chatType === "group") {
    return `#${withoutPrefix}`;
  }
  if (chatType === "direct") {
    return `@${withoutPrefix}`;
  }
  return `@${withoutPrefix}`;
}

export function normalizeSimplexGroupRef(raw: string): string {
  return normalizeSimplexChatRef(raw, "group");
}

export function readChatRef(params: SimplexActionParams): string {
  const raw =
    readStringParam(params, "chatRef") ??
    readStringParam(params, "to") ??
    readStringParam(params, "chatId");
  if (!raw) {
    throw new Error("chatRef or to required");
  }
  const chatType = readStringParam(params, "chatType");
  return normalizeSimplexChatRef(raw, chatType);
}

export function readGroupTarget(params: SimplexActionParams): string {
  const target =
    readStringParam(params, "to") ??
    readStringParam(params, "chatRef") ??
    readStringParam(params, "groupId");
  if (!target) {
    throw new Error("groupId or to required");
  }
  return target;
}

export function readMessageIds(params: SimplexActionParams): Array<number | string> {
  const raw = params.messageIds ?? params.messageId ?? params.chatItemId;
  if (Array.isArray(raw)) {
    const ids = raw
      .map((entry) => (typeof entry === "number" ? entry : String(entry).trim()))
      .filter((entry) => (typeof entry === "number" ? Number.isFinite(entry) : Boolean(entry)));
    if (ids.length > 0) {
      return ids;
    }
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    return [raw];
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed) {
      if (trimmed.includes(",")) {
        const parts = trimmed
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          return parts;
        }
      }
      return [trimmed];
    }
  }
  throw new Error("messageId or messageIds required");
}

export function readDeleteMode(params: SimplexActionParams): DeleteMode | undefined {
  const deleteModeRaw = readStringParam(params, "deleteMode");
  if (
    deleteModeRaw === "broadcast" ||
    deleteModeRaw === "internal" ||
    deleteModeRaw === "internalMark"
  ) {
    return deleteModeRaw;
  }
  return undefined;
}

export function readUploadMediaUrl(params: SimplexActionParams): string | undefined {
  return (
    readStringParam(params, "mediaUrl") ??
    readStringParam(params, "media") ??
    readStringParam(params, "filePath") ??
    readStringParam(params, "path")
  );
}
