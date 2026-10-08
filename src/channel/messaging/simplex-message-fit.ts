import { chunkTextRanges } from "openclaw/plugin-sdk/text-chunking";
import {
  SIMPLEX_MAX_ENCODED_MSG_BYTES,
  SIMPLEX_MSG_ENVELOPE_RESERVE_BYTES,
} from "../../constants.js";
import type { SimplexMsgContent } from "../../types/simplex.js";

/**
 * Below this much room beside a quote, a reply that does not fit whole is sent
 * unquoted rather than opening with a fragment.
 */
const MIN_QUOTED_PART_BYTES = 256;

/** A file invitation's fields besides the file name: size, digest, inline mode. */
const FILE_INVITATION_RESERVE_BYTES = 256;

// simplex-chat's `quoteContent` reduces the quote to its text when the reply is
// itself an image, link, video or chat card. Otherwise it embeds the quoted
// content whole, including an image's thumbnail.
const REPLY_TYPES_THAT_REDUCE_QUOTE: ReadonlySet<SimplexMsgContent["type"]> = new Set<
  SimplexMsgContent["type"]
>(["link", "image", "video", "chat", "unknown"]);

function encodedJsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function encodedTextBytes(text: string): number {
  return encodedJsonBytes(text) - 2;
}

export function measureSimplexQuoteBytes(
  quoted: SimplexMsgContent,
  replyType: SimplexMsgContent["type"]
): number {
  return encodedJsonBytes(
    REPLY_TYPES_THAT_REDUCE_QUOTE.has(replyType) ? { type: "text", text: quoted.text } : quoted
  );
}

function fittingPrefixEnd(text: string, budget: number): number {
  let limit = Math.min(text.length, budget);
  for (;;) {
    const end = chunkTextRanges(text, { limit, mode: "preferred" })[0]?.end ?? text.length;
    const bytes = encodedTextBytes(text.slice(0, end));
    if (bytes <= budget || limit <= 1) {
      return end;
    }
    limit = Math.max(1, Math.min(limit - 1, Math.floor((limit * budget) / bytes)));
  }
}

function splitTextToBudgets(text: string, budgetFor: (index: number) => number): string[] {
  if (encodedTextBytes(text) <= budgetFor(0)) {
    return [text];
  }
  const parts: string[] = [];
  let rest = text;
  while (rest) {
    const end = fittingPrefixEnd(rest, budgetFor(parts.length));
    const part = rest.slice(0, end).trimEnd();
    if (part) {
      parts.push(part);
    }
    rest = rest.slice(end).trimStart();
  }
  return parts;
}

/**
 * Plans the text of an outbound reply so every message fits `simplex-chat`'s
 * encoded size limit. `overheadBytes` is everything the first message carries
 * besides its text (see `measureSimplexContentOverheadBytes`). A quote, when
 * given, rides on the first part only, and is dropped when it leaves no useful
 * room beside it.
 */
export function planSimplexTextParts(params: {
  text: string;
  overheadBytes: number;
  quoteBytes?: number;
}): { parts: string[]; quoted: boolean } {
  const room = SIMPLEX_MAX_ENCODED_MSG_BYTES - SIMPLEX_MSG_ENVELOPE_RESERVE_BYTES;
  const budget = room - params.overheadBytes;
  const quotedBudget = budget - (params.quoteBytes ?? 0);
  const quoted =
    params.quoteBytes !== undefined &&
    quotedBudget >= 0 &&
    (encodedTextBytes(params.text) <= quotedBudget || quotedBudget >= MIN_QUOTED_PART_BYTES);
  if (!params.text) {
    return { parts: [], quoted };
  }
  return {
    parts: splitTextToBudgets(params.text, (index) =>
      quoted && index === 0 ? quotedBudget : budget
    ),
    quoted,
  };
}

/**
 * Bytes a message carries besides its text: the encoded `msgContent` with empty
 * text, plus the file invitation that accompanies an attachment.
 */
export function measureSimplexContentOverheadBytes(
  content: SimplexMsgContent,
  attachment?: { fileName: string }
): number {
  const contentBytes = encodedJsonBytes({ ...content, text: "" });
  return attachment
    ? contentBytes + encodedJsonBytes(attachment.fileName) + FILE_INVITATION_RESERVE_BYTES
    : contentBytes;
}
