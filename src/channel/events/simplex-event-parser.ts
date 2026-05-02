import type { SimplexChatContext, SimplexChatItem } from "../../types/events.js";
import { stripSimplexPrefix } from "../shared/simplex-common.js";

const INBOUND_DIRS = new Set(["directRcv", "groupRcv"]);

export function normalizeSimplexSenderId(value?: string | null): string | undefined {
  let trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  trimmed = stripSimplexPrefix(trimmed);
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.startsWith("@")) {
    trimmed = trimmed.slice(1).trim();
  } else {
    const kindLower = trimmed.toLowerCase();
    if (kindLower.startsWith("contact:")) {
      trimmed = trimmed.slice("contact:".length).trim();
    } else if (kindLower.startsWith("user:")) {
      trimmed = trimmed.slice("user:".length).trim();
    } else if (kindLower.startsWith("member:")) {
      trimmed = trimmed.slice("member:".length).trim();
    }
  }
  return trimmed || undefined;
}

export function resolveSimplexMessageText(
  content: { type?: string; text?: string } | undefined,
  fileName?: string
): string {
  if (!content) {
    return "";
  }
  const text = content.text?.trim() ?? "";
  if (text) {
    return text;
  }
  switch (content.type) {
    case "image":
      return "[image]";
    case "video":
      return "[video]";
    case "voice":
      return "[voice message]";
    case "file":
      return fileName ? `[file: ${fileName}]` : "[file]";
    case "link":
      return "[link]";
    case "report":
      return "[report]";
    case "chat":
      return "[chat]";
    default:
      return "[message]";
  }
}

export function isInboundSimplexChatItem(item: SimplexChatItem): boolean {
  const dir = item.chatItem?.chatDir?.type;
  return Boolean(dir && INBOUND_DIRS.has(dir));
}

export function resolveSimplexChatContext(item: SimplexChatItem): SimplexChatContext | null {
  const info = item.chatInfo;
  if (!info || !item.chatItem) {
    return null;
  }
  if (info.type === "direct") {
    const contactId = info.contact?.contactId;
    if (typeof contactId !== "number") {
      return null;
    }
    const senderName =
      info.contact?.localDisplayName?.trim() ||
      info.contact?.profile?.displayName?.trim() ||
      undefined;
    return {
      chatType: "direct",
      chatId: contactId,
      chatLabel: senderName || `contact:${contactId}`,
      senderId: String(contactId),
      senderName,
    };
  }
  if (info.type === "group") {
    const groupId = info.groupInfo?.groupId;
    if (typeof groupId !== "number") {
      return null;
    }
    const member = item.chatItem?.chatDir?.groupMember;
    const contactId =
      typeof member?.contactId === "number"
        ? String(member.contactId)
        : member?.contactId?.trim() || undefined;
    const senderId =
      contactId ??
      member?.memberId?.trim() ??
      (typeof member?.groupMemberId === "number" ? String(member.groupMemberId) : undefined);
    const senderName = member?.localDisplayName?.trim() || undefined;
    const groupLabel = info.groupInfo?.localDisplayName?.trim() || `group:${groupId}`;
    return {
      chatType: "group",
      chatId: groupId,
      chatLabel: groupLabel,
      senderId: senderId || undefined,
      senderName,
    };
  }
  return null;
}
