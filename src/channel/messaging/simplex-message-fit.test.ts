import { describe, expect, it } from "vitest";
import {
  SIMPLEX_MAX_ENCODED_MSG_BYTES,
  SIMPLEX_MSG_ENVELOPE_RESERVE_BYTES,
} from "../../constants.js";
import type { SimplexMsgContent } from "../../types/simplex.js";
import {
  measureSimplexContentOverheadBytes,
  measureSimplexQuoteBytes,
  planSimplexTextParts,
} from "./simplex-message-fit.js";

const ROOM = SIMPLEX_MAX_ENCODED_MSG_BYTES - SIMPLEX_MSG_ENVELOPE_RESERVE_BYTES;
const TEXT_OVERHEAD = measureSimplexContentOverheadBytes({ type: "text", text: "" });

function encodedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function prose(bytes: number): string {
  const sentence = "The agent explains the photo in some detail. ";
  return sentence
    .repeat(Math.ceil(bytes / sentence.length))
    .slice(0, bytes)
    .trim();
}

// The photo from #33: a 13,874-byte thumbnail and a 241-byte caption.
const photo: SimplexMsgContent = {
  type: "image",
  text: "c".repeat(241),
  image: `data:image/jpg;base64,${"A".repeat(13_874 - 22)}`,
};

function plan(text: string, quoted?: SimplexMsgContent) {
  return planSimplexTextParts({
    text,
    overheadBytes: TEXT_OVERHEAD,
    quoteBytes: quoted ? measureSimplexQuoteBytes(quoted, "text") : undefined,
  });
}

describe("planSimplexTextParts", () => {
  it("leaves text that fits untouched", () => {
    const text = "  short reply with trailing space  ";
    expect(plan(text, { type: "text", text: "question" })).toEqual({
      parts: [text],
      quoted: true,
    });
  });

  it("keeps the quote on a reply to a photo by moving the overflow to a second message", () => {
    const text = prose(2_363);
    const quoteBytes = measureSimplexQuoteBytes(photo, "text");
    const { parts, quoted } = plan(text, photo);

    expect(quoted).toBe(true);
    expect(parts.length).toBeGreaterThan(1);
    expect(encodedBytes(parts[0]) - 2 + quoteBytes + TEXT_OVERHEAD).toBeLessThanOrEqual(ROOM);
    expect(parts.join(" ")).toBe(text);
  });

  it("drops a quote that leaves no useful room beside it", () => {
    const longQuestion: SimplexMsgContent = { type: "text", text: prose(14_900) };
    const { parts, quoted } = plan(prose(2_000), longQuestion);

    expect(quoted).toBe(false);
    expect(parts).toHaveLength(1);
  });

  it("splits by encoded bytes, not characters", () => {
    const emoji = "😀".repeat(4_000);
    const { parts } = plan(emoji);

    expect(encodedBytes(emoji)).toBeGreaterThan(SIMPLEX_MAX_ENCODED_MSG_BYTES);
    expect(parts.length).toBe(2);
    expect(parts.join("")).toBe(emoji);
    for (const part of parts) {
      expect(encodedBytes(part) - 2 + TEXT_OVERHEAD).toBeLessThanOrEqual(ROOM);
      expect(part).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
  });

  it("counts JSON escaping toward the size", () => {
    const controls = "\u0001".repeat(3_000);
    const { parts } = plan(controls);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(encodedBytes(part) - 2 + TEXT_OVERHEAD).toBeLessThanOrEqual(ROOM);
    }
  });

  it("quotes a media-only reply when the quote fits beside it", () => {
    expect(plan("", photo)).toEqual({ parts: [], quoted: true });
  });
});

describe("measureSimplexQuoteBytes", () => {
  it("counts the thumbnail when the reply is text", () => {
    expect(measureSimplexQuoteBytes(photo, "text")).toBeGreaterThan(13_874);
  });

  it("counts only the quoted text when the reply is itself an image", () => {
    expect(measureSimplexQuoteBytes(photo, "image")).toBe(
      encodedBytes({ type: "text", text: photo.text })
    );
  });
});

describe("measureSimplexContentOverheadBytes", () => {
  it("adds the file invitation for an attachment", () => {
    const content: SimplexMsgContent = { type: "file", text: "caption" };
    expect(measureSimplexContentOverheadBytes(content, { fileName: "report.pdf" })).toBeGreaterThan(
      measureSimplexContentOverheadBytes(content) + "report.pdf".length
    );
  });
});
