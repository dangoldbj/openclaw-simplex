import { describe, expect, it } from "vitest";
import {
  normalizeSimplexChannelRef,
  normalizeSimplexChatRef,
  normalizeSimplexContactRef,
  normalizeSimplexGroupRef,
  readSimplexChatRefKind,
} from "./chat-ref.js";

describe("normalizeSimplexChatRef", () => {
  it("keeps canonical sigil refs untouched", () => {
    expect(normalizeSimplexChatRef("@alice")).toBe("@alice");
    expect(normalizeSimplexChatRef("#ops")).toBe("#ops");
    expect(normalizeSimplexChatRef("!news")).toBe("!news");
  });

  it("folds spelled-out prefixes into sigils", () => {
    expect(normalizeSimplexChatRef("contact:alice")).toBe("@alice");
    expect(normalizeSimplexChatRef("user:alice")).toBe("@alice");
    expect(normalizeSimplexChatRef("member:alice")).toBe("@alice");
    expect(normalizeSimplexChatRef("group:ops")).toBe("#ops");
    expect(normalizeSimplexChatRef("channel:news")).toBe("!news");
  });

  it("strips the provider prefix first", () => {
    expect(normalizeSimplexChatRef("simplex:@alice")).toBe("@alice");
    expect(normalizeSimplexChatRef("simplex:group:ops")).toBe("#ops");
    expect(normalizeSimplexChatRef("simplex:!news")).toBe("!news");
  });

  // Regression: the action path used to turn every channel reference into a
  // malformed contact ref such as "@!news".
  it("never coerces a channel reference into a contact", () => {
    expect(normalizeSimplexChatRef("!news")).toBe("!news");
    expect(normalizeSimplexChatRef("!news", "direct")).toBe("!news");
    expect(normalizeSimplexChatRef("channel:news", "direct")).toBe("!news");
    expect(normalizeSimplexChatRef("simplex:!news")).toBe("!news");
  });

  it("uses chatType only for unmarked ids", () => {
    expect(normalizeSimplexChatRef("alice")).toBe("@alice");
    expect(normalizeSimplexChatRef("ops", "group")).toBe("#ops");
    expect(normalizeSimplexChatRef("news", "channel")).toBe("!news");
    // An explicit marker always wins over the hint.
    expect(normalizeSimplexChatRef("#ops", "direct")).toBe("#ops");
  });

  it("returns the input when a marker carries no id", () => {
    expect(normalizeSimplexChatRef("group:")).toBe("group:");
    expect(normalizeSimplexChatRef("@")).toBe("@");
  });

  it("passes empty input through", () => {
    expect(normalizeSimplexChatRef("")).toBe("");
    expect(normalizeSimplexChatRef("   ")).toBe("");
  });
});

describe("kind-specific helpers", () => {
  it("apply their kind only as a fallback", () => {
    expect(normalizeSimplexGroupRef("ops")).toBe("#ops");
    expect(normalizeSimplexGroupRef("@alice")).toBe("@alice");
    expect(normalizeSimplexChannelRef("news")).toBe("!news");
    expect(normalizeSimplexContactRef("alice")).toBe("@alice");
  });

  // Regression: this used to return "@#ops", which hid group refs from callers
  // that tried to reject them.
  it("does not disguise a group or channel as a contact", () => {
    expect(normalizeSimplexContactRef("#ops")).toBe("#ops");
    expect(normalizeSimplexContactRef("!news")).toBe("!news");
    expect(normalizeSimplexContactRef("group:ops")).toBe("#ops");
  });
});

describe("readSimplexChatRefKind", () => {
  it("reports the kind a canonical ref denotes", () => {
    expect(readSimplexChatRefKind("@alice")).toBe("direct");
    expect(readSimplexChatRefKind("#ops")).toBe("group");
    expect(readSimplexChatRefKind("!news")).toBe("channel");
    expect(readSimplexChatRefKind("alice")).toBeNull();
  });
});
