import { describe, expect, it } from "vitest";
import { readChatRef, readGroupTarget, readNumberParam } from "./params.js";

describe("simplex action params", () => {
  it("strictly parses integer params", () => {
    expect(readNumberParam({ messageId: "123" }, "messageId", { integer: true })).toBe(123);
    expect(readNumberParam({ messageId: 123 }, "messageId", { integer: true })).toBe(123);
  });

  it("rejects partial or decimal integer params", () => {
    expect(() => readNumberParam({ messageId: "123abc" }, "messageId", { integer: true })).toThrow(
      /messageId must be an integer/
    );
    expect(() => readNumberParam({ messageId: "12.5" }, "messageId", { integer: true })).toThrow(
      /messageId must be an integer/
    );
    expect(() => readNumberParam({ messageId: 12.5 }, "messageId", { integer: true })).toThrow(
      /messageId must be an integer/
    );
  });

  it("strictly parses decimal number params", () => {
    expect(readNumberParam({ score: "12.5" }, "score")).toBe(12.5);
    expect(() => readNumberParam({ score: "12.5ms" }, "score")).toThrow(/score must be a number/);
  });
});

describe("readChatRef", () => {
  it("accepts chatRef, to, and chatId in that order", () => {
    expect(readChatRef({ chatRef: "@alice", to: "@bob" })).toBe("@alice");
    expect(readChatRef({ to: "@bob" })).toBe("@bob");
    expect(readChatRef({ chatId: "@carol" })).toBe("@carol");
  });

  it("canonicalizes spelled-out prefixes", () => {
    expect(readChatRef({ to: "group:ops" })).toBe("#ops");
    expect(readChatRef({ to: "contact:alice" })).toBe("@alice");
    expect(readChatRef({ to: "simplex:@alice" })).toBe("@alice");
  });

  // Regression: agent actions targeting a channel produced "@!news", which is
  // not a usable SimpleX reference.
  it("preserves channel targets", () => {
    expect(readChatRef({ to: "!news" })).toBe("!news");
    expect(readChatRef({ to: "channel:news" })).toBe("!news");
    expect(readChatRef({ to: "!news", chatType: "channel" })).toBe("!news");
  });

  it("applies chatType only to an unmarked id", () => {
    expect(readChatRef({ to: "ops", chatType: "group" })).toBe("#ops");
    expect(readChatRef({ to: "alice" })).toBe("@alice");
    expect(readChatRef({ to: "#ops", chatType: "direct" })).toBe("#ops");
  });

  it("requires a target", () => {
    expect(() => readChatRef({})).toThrow("chatRef or to required");
  });
});

describe("readGroupTarget", () => {
  // Deliberately a raw reader: callers apply `normalizeSimplexGroupRef` so the
  // group sigil is added once, at the point the id is actually used.
  it("returns the raw target using to/chatRef/groupId precedence", () => {
    expect(readGroupTarget({ to: "ops", chatRef: "#other" })).toBe("ops");
    expect(readGroupTarget({ chatRef: "#ops" })).toBe("#ops");
    expect(readGroupTarget({ groupId: "7" })).toBe("7");
  });

  it("requires a target", () => {
    expect(() => readGroupTarget({})).toThrow("groupId or to required");
  });
});
