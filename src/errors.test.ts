import { describe, expect, it } from "vitest";
import { describeError } from "./errors.js";

describe("describeError", () => {
  it("uses the message of an Error", () => {
    expect(describeError(new Error("boom"))).toBe("boom");
  });

  it("keeps subclass messages", () => {
    expect(describeError(new TypeError("bad type"))).toBe("bad type");
  });

  // `catch` binds unknown, so non-Error throws reach this helper in practice.
  it("stringifies non-Error throws", () => {
    expect(describeError("plain string")).toBe("plain string");
    expect(describeError(42)).toBe("42");
    expect(describeError(null)).toBe("null");
    expect(describeError(undefined)).toBe("undefined");
  });
});
