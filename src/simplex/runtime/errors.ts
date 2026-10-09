export type SimplexCommandErrorResponse = {
  type?: string;
  chatError?: unknown;
};

// `ChatError` is tagged by `type`, and each variant carries its detail under a
// different key. Some runtimes omit the tag, so the detail key alone is enough.
const CHAT_ERROR_VARIANTS = [
  { detailKey: "errorType", label: "command" },
  { detailKey: "storeError", label: "store" },
  { detailKey: "agentError", label: "agent" },
] as const;

// Agent errors nest their cause under keys like `smpErr` or `connErr`.
const NESTED_ERROR_KEY = /Err(or)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readTrimmed(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}

function collectErrorTags(detail: Record<string, unknown>): string[] {
  const tag = readTrimmed(detail.type);
  const tags = tag ? [tag] : [];
  for (const [key, value] of Object.entries(detail)) {
    if (NESTED_ERROR_KEY.test(key) && isRecord(value)) {
      return [...tags, ...collectErrorTags(value)];
    }
  }
  return tags;
}

export function resolveSimplexCommandError(
  resp: SimplexCommandErrorResponse | undefined
): string | undefined {
  if (!resp || resp.type !== "chatCmdError") {
    return undefined;
  }
  const chatError = isRecord(resp.chatError) ? resp.chatError : {};
  for (const { detailKey, label } of CHAT_ERROR_VARIANTS) {
    const detail = chatError[detailKey];
    if (!isRecord(detail)) {
      continue;
    }
    const message = readTrimmed(detail.message);
    if (message) {
      return message;
    }
    const tags = collectErrorTags(detail);
    if (tags.length > 0) {
      return `SimpleX ${label} error: ${tags.join(" ")}`;
    }
  }
  return "SimpleX command failed";
}
