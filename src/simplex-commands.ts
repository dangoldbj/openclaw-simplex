export type SimplexChatType = "direct" | "group" | "local";

export type SimplexChatRef = {
  type: SimplexChatType;
  id: number | string;
  scope?: string | null;
};

export type SimplexMsgContent = {
  type: "text" | "link" | "image" | "video" | "voice" | "file" | "report" | "chat" | "unknown";
  text: string;
  [key: string]: unknown;
};

export type SimplexComposedMessage = {
  msgContent: SimplexMsgContent;
  quotedItemId?: number;
  fileSource?: {
    filePath: string;
    cryptoArgs?: { fileKey: string; fileNonce: string };
  };
  mentions?: Record<string, number>;
};

export const SIMPLEX_SEND_COMMAND_SAFE_BYTES = 14_000;

function isAsciiAlnumUnderscoreOrHyphen(value: string): boolean {
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isDigit && !isUpper && !isLower && ch !== "_" && ch !== "-") {
      return false;
    }
  }
  return value.length > 0;
}

function isSignedIntegerToken(value: string): boolean {
  if (!value) {
    return false;
  }
  const start = value[0] === "-" ? 1 : 0;
  if (start === value.length) {
    return false;
  }
  for (let i = start; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  return true;
}

function normalizeSimplexChatRef(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return trimmed;
  }

  const withoutPrefix = trimmed.toLowerCase().startsWith("simplex:")
    ? trimmed.slice("simplex:".length).trim()
    : trimmed;
  if (!withoutPrefix) {
    return withoutPrefix;
  }
  if (withoutPrefix.startsWith("#") || withoutPrefix.toLowerCase().startsWith("group:")) {
    return normalizeGroupRef(withoutPrefix);
  }
  if (withoutPrefix.startsWith("@")) {
    return normalizeContactRef(withoutPrefix);
  }

  const lowered = withoutPrefix.toLowerCase();
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    return normalizeContactRef(withoutPrefix);
  }

  return normalizeContactRef(withoutPrefix);
}

function normalizeChatRefToken(value: string): string {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  const normalized =
    lowered.startsWith("simplex:") ||
    lowered.startsWith("group:") ||
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
      ? normalizeSimplexChatRef(trimmed)
      : trimmed;
  const prefix = normalized[0];
  const body = normalized.slice(1);
  if ((prefix !== "@" && prefix !== "#") || !isAsciiAlnumUnderscoreOrHyphen(body)) {
    throw new Error(`invalid SimpleX chat ref: ${value}`);
  }
  return normalized;
}

function normalizeChatItemIdToken(value: number | string): string {
  const normalized = normalizeCommandId(value);
  if (!isSignedIntegerToken(normalized)) {
    throw new Error(`invalid SimpleX chat item id: ${value}`);
  }
  return normalized;
}

function quoteCliArg(value: string): string {
  const trimmed = value.trim();
  const hasControlNewline =
    trimmed.includes("\n") || trimmed.includes("\r") || trimmed.includes("\u0000");
  if (!trimmed || hasControlNewline) {
    throw new Error("invalid SimpleX CLI argument");
  }
  return `'${trimmed.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function hasWhitespace(value: string): boolean {
  for (const ch of value) {
    if (ch.trim() === "") {
      return true;
    }
  }
  return false;
}

export function formatChatRef(ref: SimplexChatRef): string {
  if (ref.type === "local") {
    throw new Error("local SimpleX chat refs are not supported for message commands");
  }
  if (ref.scope) {
    throw new Error("scoped SimpleX chat refs are not supported for message commands");
  }
  const prefix = ref.type === "direct" ? "@" : "#";
  return `${prefix}${ref.id}`;
}

export function buildSendMessagesCommand(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  liveMessage?: boolean;
  ttl?: number;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const liveFlag = params.liveMessage ? " live=on" : "";
  const ttlFlag = typeof params.ttl === "number" ? ` ttl=${params.ttl}` : "";
  const json = JSON.stringify(params.composedMessages);
  return `/_send ${chatRef}${liveFlag}${ttlFlag} json ${json}`;
}

function measureSendMessagesCommandBytes(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
}): number {
  return Buffer.byteLength(buildSendMessagesCommand(params), "utf8");
}

function withUpdatedMessageText(
  message: SimplexComposedMessage,
  text: string
): SimplexComposedMessage {
  return {
    ...message,
    msgContent: {
      ...message.msgContent,
      text,
    },
  };
}

function buildContinuationTextMessage(
  message: SimplexComposedMessage,
  text: string
): SimplexComposedMessage {
  if (message.fileSource || message.msgContent.type !== "text") {
    return {
      msgContent: {
        type: "text",
        text,
      },
    };
  }
  return {
    msgContent: {
      ...message.msgContent,
      text,
    },
  };
}

function splitOversizedComposedMessage(params: {
  chatRef: string;
  message: SimplexComposedMessage;
  maxBytes: number;
}): SimplexComposedMessage[] {
  const text = params.message.msgContent.text;
  if (!text) {
    throw new Error("SimpleX composed message exceeds safe send budget");
  }

  const codePoints = Array.from(text);
  const chunks: SimplexComposedMessage[] = [];
  let offset = 0;

  while (offset < codePoints.length) {
    const buildMessage =
      chunks.length === 0
        ? (chunkText: string) => withUpdatedMessageText(params.message, chunkText)
        : (chunkText: string) => buildContinuationTextMessage(params.message, chunkText);
    let low = 1;
    let high = codePoints.length - offset;
    let best = 0;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = buildMessage(codePoints.slice(offset, offset + mid).join(""));
      const size = measureSendMessagesCommandBytes({
        chatRef: params.chatRef,
        composedMessages: [candidate],
      });
      if (size <= params.maxBytes) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (best === 0) {
      throw new Error("SimpleX composed message exceeds safe send budget");
    }

    const chunkText = codePoints.slice(offset, offset + best).join("");
    chunks.push(buildMessage(chunkText));
    offset += best;
  }

  return chunks;
}

export function splitSendMessageBatches(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  maxBytes?: number;
}): SimplexComposedMessage[][] {
  const maxBytes = params.maxBytes ?? SIMPLEX_SEND_COMMAND_SAFE_BYTES;
  const batches: SimplexComposedMessage[][] = [];
  let currentBatch: SimplexComposedMessage[] = [];

  const pushMessage = (message: SimplexComposedMessage): void => {
    const nextBatch = [...currentBatch, message];
    if (
      currentBatch.length === 0 ||
      measureSendMessagesCommandBytes({
        chatRef: params.chatRef,
        composedMessages: nextBatch,
      }) <= maxBytes
    ) {
      currentBatch = nextBatch;
      return;
    }
    batches.push(currentBatch);
    currentBatch = [message];
  };

  for (const message of params.composedMessages) {
    const messageFits =
      measureSendMessagesCommandBytes({
        chatRef: params.chatRef,
        composedMessages: [message],
      }) <= maxBytes;
    const normalizedMessages = messageFits
      ? [message]
      : splitOversizedComposedMessage({
          chatRef: params.chatRef,
          message,
          maxBytes,
        });
    for (const normalizedMessage of normalizedMessages) {
      pushMessage(normalizedMessage);
    }
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

export function buildUpdateChatItemCommand(params: {
  chatRef: string;
  chatItemId: number;
  updatedMessage: SimplexComposedMessage;
  liveMessage?: boolean;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const liveFlag = params.liveMessage ? " live=on" : "";
  const json = JSON.stringify(params.updatedMessage);
  return `/_update item ${chatRef} ${chatItemId}${liveFlag} json ${json}`;
}

export function buildDeleteChatItemCommand(params: {
  chatRef: string;
  chatItemIds: Array<number | string>;
  deleteMode?: "broadcast" | "internal" | "internalMark";
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const deleteMode = params.deleteMode ?? "broadcast";
  const ids = params.chatItemIds.map((id) => normalizeChatItemIdToken(id)).join(",");
  return `/_delete item ${chatRef} ${ids} ${deleteMode}`;
}

export function buildReactionCommand(params: {
  chatRef: string;
  chatItemId: number;
  add: boolean;
  reaction: Record<string, unknown>;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const toggle = params.add ? "on" : "off";
  const json = JSON.stringify(params.reaction);
  return `/_reaction ${chatRef} ${chatItemId} ${toggle} ${json}`;
}

export function buildReceiveFileCommand(params: {
  fileId: number;
  filePath?: string;
  inline?: boolean;
  encrypt?: boolean;
  approvedRelays?: boolean;
}): string {
  if (!Number.isFinite(params.fileId)) {
    throw new Error(`invalid SimpleX file id: ${params.fileId}`);
  }
  const flags: string[] = [];
  if (params.approvedRelays) {
    flags.push("approved_relays=on");
  }
  if (typeof params.encrypt === "boolean") {
    flags.push(`encrypt=${params.encrypt ? "on" : "off"}`);
  }
  if (typeof params.inline === "boolean") {
    flags.push(`inline=${params.inline ? "on" : "off"}`);
  }
  const path = params.filePath ? ` ${quoteCliArg(params.filePath)}` : "";
  const suffix = flags.length > 0 ? ` ${flags.join(" ")}` : "";
  return `/freceive ${Math.trunc(params.fileId)}${suffix}${path}`;
}

export function buildCancelFileCommand(fileId: number): string {
  return `/fcancel ${fileId}`;
}

function normalizeCommandId(value: number | string): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value).trim();
}

function normalizeContactRef(value: number | string): string {
  const raw = normalizeCommandId(value);
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("@")) {
    return raw;
  }
  const lowered = raw.toLowerCase();
  if (
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
  ) {
    return `@${raw.slice(raw.indexOf(":") + 1).trim()}`;
  }
  return `@${raw}`;
}

function normalizeGroupRef(value: number | string): string {
  const raw = normalizeCommandId(value);
  if (!raw) {
    return raw;
  }
  if (raw.startsWith("#")) {
    return raw;
  }
  if (raw.toLowerCase().startsWith("group:")) {
    return `#${raw.slice("group:".length).trim()}`;
  }
  return `#${raw}`;
}

function formatSearchArg(search?: string | null): string {
  const trimmed = search?.trim();
  if (!trimmed) {
    return "";
  }
  if (hasWhitespace(trimmed)) {
    return `'${trimmed.replaceAll("'", "\\'")}'`;
  }
  return trimmed;
}

export function buildListUsersCommand(): string {
  return "/users";
}

export function buildShowActiveUserCommand(): string {
  return "/user";
}

export function buildListContactsCommand(userId: number | string): string {
  const id = normalizeCommandId(userId);
  return `/_contacts ${id}`;
}

export function buildListGroupsCommand(params: {
  userId: number | string;
  contactId?: number | string | null;
  search?: string | null;
}): string {
  const userId = normalizeCommandId(params.userId);
  const contactRef = params.contactId ? normalizeContactRef(params.contactId) : "";
  const search = formatSearchArg(params.search);
  const parts = ["/_groups", userId, contactRef, search].filter(Boolean);
  return parts.join(" ");
}

export function buildListGroupMembersCommand(params: {
  groupId: number | string;
  search?: string | null;
}): string {
  const groupRef = normalizeGroupRef(params.groupId);
  const search = formatSearchArg(params.search);
  const parts = ["/_members", groupRef, search].filter(Boolean);
  return parts.join(" ");
}

export function buildAddGroupMemberCommand(params: {
  groupId: number | string;
  contactId: number | string;
}): string {
  return `/_add ${normalizeGroupRef(params.groupId)} ${normalizeContactRef(params.contactId)}`;
}

export function buildRemoveGroupMemberCommand(params: {
  groupId: number | string;
  memberId: number | string;
}): string {
  return `/_remove ${normalizeGroupRef(params.groupId)} ${normalizeContactRef(params.memberId)}`;
}

export function buildLeaveGroupCommand(groupId: number | string): string {
  return `/_leave ${normalizeGroupRef(groupId)}`;
}

export function buildUpdateGroupProfileCommand(params: {
  groupId: number | string;
  profile: Record<string, unknown>;
}): string {
  return `/_group_profile ${normalizeGroupRef(params.groupId)} ${JSON.stringify(params.profile)}`;
}
