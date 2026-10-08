import { SIMPLEX_PROVIDER_PREFIXES, stripSimplexProviderPrefix } from "../../constants.js";
import type {
  SimplexChatRef,
  SimplexComposedMessage,
  SimplexDeleteMode,
  SimplexGroupProfile,
  SimplexMsgContent,
  SimplexReaction,
} from "../../types/simplex.js";
import { normalizeSimplexChatRef } from "../chat-ref.js";

export type SimplexInviteMode = "connect" | "address";

export const INVITE_COMMANDS: Record<SimplexInviteMode, string> = {
  connect: "/c",
  address: "/ad",
};

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

function normalizeCommandId(value: number | string): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return String(value).trim();
}

function normalizePositiveIntegerToken(value: number | string, label: string): string {
  const normalized = normalizeCommandId(value);
  if (!isSignedIntegerToken(normalized)) {
    throw new Error(`invalid SimpleX ${label}: ${value}`);
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid SimpleX ${label}: ${value}`);
  }
  return normalized;
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

function normalizeChatRefToken(value: string): string {
  const trimmed = value.trim();
  const lowered = trimmed.toLowerCase();
  const normalized =
    SIMPLEX_PROVIDER_PREFIXES.some((prefix) => lowered.startsWith(`${prefix}:`)) ||
    lowered.startsWith("group:") ||
    lowered.startsWith("channel:") ||
    lowered.startsWith("contact:") ||
    lowered.startsWith("user:") ||
    lowered.startsWith("member:")
      ? normalizeSimplexChatRef(trimmed)
      : trimmed;
  const prefix = normalized[0];
  const body = normalized.slice(1);
  if (
    (prefix !== "@" && prefix !== "#" && prefix !== "!") ||
    !isAsciiAlnumUnderscoreOrHyphen(body)
  ) {
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

function normalizeTtlToken(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`invalid SimpleX ttl: ${value}`);
  }
  return String(value);
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

function formatSearchArg(search?: string | null): string {
  const trimmed = search?.trim();
  if (!trimmed) {
    return "";
  }
  if ([...trimmed].some((ch) => ch.trim() === "")) {
    return quoteCliArg(trimmed);
  }
  return trimmed;
}

function formatConnectLinkArg(link: string): string {
  const trimmed = link.trim();
  if (!trimmed || [...trimmed].some((ch) => ch.trim() === "" || ch === "\u0000")) {
    throw new Error("invalid SimpleX connection link");
  }
  return trimmed;
}

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

export function parseSimplexNumericId(value: number | string): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? value : null;
  }
  const raw = stripSimplexProviderPrefix(value.trim());
  const normalized = raw.startsWith("@")
    ? raw.slice(1)
    : raw.startsWith("#")
      ? raw.slice(1)
      : raw.includes(":")
        ? raw.slice(raw.indexOf(":") + 1)
        : raw;
  const token = normalized.trim();
  if (!isSignedIntegerToken(token)) {
    return null;
  }
  const id = Number.parseInt(token, 10);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const MSG_CONTENT_TYPES: ReadonlySet<string> = new Set<SimplexMsgContent["type"]>([
  "text",
  "link",
  "image",
  "video",
  "voice",
  "file",
  "report",
  "chat",
  "unknown",
]);

function isMsgContentType(value: unknown): value is SimplexMsgContent["type"] {
  return typeof value === "string" && MSG_CONTENT_TYPES.has(value);
}

/**
 * Finds one item's message content in an `apiChat` response. The payload is
 * untrusted, so anything not shaped like message content yields `undefined`.
 */
export function findSimplexChatItemMsgContent(
  payload: unknown,
  chatItemId: number
): SimplexMsgContent | undefined {
  const chat = isRecord(payload) ? payload.chat : undefined;
  const items = isRecord(chat) && Array.isArray(chat.chatItems) ? chat.chatItems : [];
  for (const item of items) {
    if (!isRecord(item) || !isRecord(item.meta) || item.meta.itemId !== chatItemId) {
      continue;
    }
    const msgContent = isRecord(item.content) ? item.content.msgContent : undefined;
    if (!isRecord(msgContent) || typeof msgContent.text !== "string") {
      return undefined;
    }
    // Content types newer than this plugin still count toward the quote's size.
    const type = isMsgContentType(msgContent.type) ? msgContent.type : "unknown";
    return { ...msgContent, type, text: msgContent.text };
  }
  return undefined;
}

export function buildGetChatItemsAroundCommand(params: {
  chatRef: string;
  chatItemId: number;
  count: number;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const count = normalizePositiveIntegerToken(params.count, "item count");
  return `/_get chat ${chatRef} around=${chatItemId} count=${count}`;
}

export function buildSendMessagesCommand(params: {
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
  liveMessage?: boolean;
  ttl?: number;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const liveFlag = params.liveMessage ? " live=on" : "";
  const ttlFlag = typeof params.ttl === "number" ? ` ttl=${normalizeTtlToken(params.ttl)}` : "";
  const json = JSON.stringify(params.composedMessages);
  return `/_send ${chatRef}${liveFlag}${ttlFlag} json ${json}`;
}

export function buildUpdateChatItemCommand(params: {
  chatRef: string;
  chatItemId: number | string;
  updatedMessage: SimplexComposedMessage;
  liveMessage?: boolean;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const liveFlag = params.liveMessage ? " live=on" : "";
  return `/_update item ${chatRef} ${chatItemId}${liveFlag} json ${JSON.stringify(
    params.updatedMessage
  )}`;
}

export function buildDeleteChatItemCommand(params: {
  chatRef: string;
  chatItemIds: Array<number | string>;
  deleteMode?: SimplexDeleteMode;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const deleteMode = params.deleteMode ?? "broadcast";
  const ids = params.chatItemIds.map((id) => normalizeChatItemIdToken(id)).join(",");
  return `/_delete item ${chatRef} ${ids} ${deleteMode}`;
}

export function buildReactionCommand(params: {
  chatRef: string;
  chatItemId: number | string;
  add: boolean;
  reaction: SimplexReaction;
}): string {
  const chatRef = normalizeChatRefToken(params.chatRef);
  const chatItemId = normalizeChatItemIdToken(params.chatItemId);
  const toggle = params.add ? "on" : "off";
  return `/_reaction ${chatRef} ${chatItemId} ${toggle} ${JSON.stringify(params.reaction)}`;
}

export function buildReceiveFileCommand(params: { fileId: number }): string {
  return `/freceive ${normalizePositiveIntegerToken(params.fileId, "file id")}`;
}

export function buildCancelFileCommand(fileId: number | string): string {
  return `/fcancel ${normalizePositiveIntegerToken(fileId, "file id")}`;
}

export function buildListUsersCommand(): string {
  return "/users";
}

export function buildShowActiveUserCommand(): string {
  return "/user";
}

export function buildListContactsCommand(userId: number | string): string {
  return `/_contacts ${normalizeCommandId(userId)}`;
}

export function buildListGroupsCommand(params: {
  userId: number | string;
  contactId?: number | string | null;
  search?: string | null;
}): string {
  const userId = normalizeCommandId(params.userId);
  const contactRef = params.contactId ? normalizeContactRef(params.contactId) : "";
  const search = formatSearchArg(params.search);
  return ["/_groups", userId, contactRef, search].filter(Boolean).join(" ");
}

export function buildListGroupMembersCommand(params: {
  groupId: number | string;
  search?: string | null;
}): string {
  const groupRef = normalizeGroupRef(params.groupId);
  const search = formatSearchArg(params.search);
  return ["/_members", groupRef, search].filter(Boolean).join(" ");
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

export function buildBlockGroupMemberCommand(params: {
  groupId: number | string;
  memberId: number | string;
}): string {
  return `/_block member ${normalizeGroupRef(params.groupId)} ${normalizeContactRef(params.memberId)}`;
}

export function buildDeleteGroupMemberMessagesCommand(params: {
  groupId: number | string;
  memberId: number | string;
  deleteMode?: SimplexDeleteMode;
}): string {
  const deleteMode = params.deleteMode ?? "broadcast";
  return `/_delete member items ${normalizeGroupRef(params.groupId)} ${normalizeContactRef(
    params.memberId
  )} ${deleteMode}`;
}

export function buildLeaveGroupCommand(groupId: number | string): string {
  return `/_leave ${normalizeGroupRef(groupId)}`;
}

export function buildUpdateGroupProfileCommand(params: {
  groupId: number | string;
  profile: Partial<SimplexGroupProfile>;
}): string {
  return `/_group_profile ${normalizeGroupRef(params.groupId)} ${JSON.stringify(params.profile)}`;
}

export function buildCreateGroupCommand(profile: SimplexGroupProfile): string {
  return `/_group json ${JSON.stringify(profile)}`;
}

export function buildCreateGroupLinkCommand(params: {
  groupId: number | string;
  role: string;
}): string {
  return `/_create link ${normalizeGroupRef(params.groupId)} ${params.role}`;
}

export function buildShowGroupLinkCommand(groupId: number | string): string {
  return `/_show link ${normalizeGroupRef(groupId)}`;
}

export function buildDeleteGroupLinkCommand(groupId: number | string): string {
  return `/_delete link ${normalizeGroupRef(groupId)}`;
}

export function buildAcceptContactRequestCommand(contactRequestId: number | string): string {
  return `/_accept ${normalizeCommandId(contactRequestId)}`;
}

export function buildRejectContactRequestCommand(contactRequestId: number | string): string {
  return `/_reject ${normalizeCommandId(contactRequestId)}`;
}

export function buildShowContactVerificationCommand(contactId: number | string): string {
  return `/_show verification ${normalizeContactRef(contactId)}`;
}

export function buildCheckContactVerificationCommand(params: {
  contactId: number | string;
  code?: string | null;
}): string {
  const suffix = params.code?.trim() ? ` ${quoteCliArg(params.code)}` : "";
  return `/_check verification ${normalizeContactRef(params.contactId)}${suffix}`;
}

export function buildConnectPlanCommand(link: string): string {
  return `/connect plan ${formatConnectLinkArg(link)}`;
}

export function buildConnectCommand(link: string): string {
  return `/connect ${formatConnectLinkArg(link)}`;
}
