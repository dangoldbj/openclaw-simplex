import { describe, expect, it } from "vitest";
import {
  readOptionalString,
  readRequiredPositiveInteger,
  readRequiredStringParam,
  readTrimmedString,
} from "./params.js";

describe("readTrimmedString", () => {
  it("trims string input", () => {
    expect(readTrimmedString("  alice  ")).toBe("alice");
  });

  it("returns an empty string for anything that is not a string", () => {
    expect(readTrimmedString(undefined)).toBe("");
    expect(readTrimmedString(null)).toBe("");
    expect(readTrimmedString(42)).toBe("");
    expect(readTrimmedString({})).toBe("");
    expect(readTrimmedString("   ")).toBe("");
  });
});

describe("readOptionalString", () => {
  it("returns undefined rather than an empty string", () => {
    expect(readOptionalString("   ")).toBeUndefined();
    expect(readOptionalString(undefined)).toBeUndefined();
    expect(readOptionalString(7)).toBeUndefined();
  });

  it("returns the trimmed value when present", () => {
    expect(readOptionalString(" ops ")).toBe("ops");
  });
});

describe("readRequiredStringParam", () => {
  it("reads and trims a present value", () => {
    expect(readRequiredStringParam({ link: " abc " }, "link")).toBe("abc");
  });

  it("names the missing key in the error", () => {
    expect(() => readRequiredStringParam({}, "link")).toThrow("link is required");
    expect(() => readRequiredStringParam(undefined, "link")).toThrow("link is required");
    expect(() => readRequiredStringParam({ link: "   " }, "link")).toThrow("link is required");
    expect(() => readRequiredStringParam({ link: 5 }, "link")).toThrow("link is required");
  });
});

describe("readRequiredPositiveInteger", () => {
  it("reads a positive integer", () => {
    expect(readRequiredPositiveInteger({ contactId: 7 }, "contactId")).toBe(7);
    expect(readRequiredPositiveInteger({ contactId: "7" }, "contactId")).toBe(7);
  });

  it("accepts numeric strings with surrounding space or leading zeros", () => {
    expect(readRequiredPositiveInteger({ contactId: " 7 " }, "contactId")).toBe(7);
    expect(readRequiredPositiveInteger({ contactId: "07" }, "contactId")).toBe(7);
  });

  // SimpleX protocol ids must never come from permissive numeric coercion.
  // `"1e3"` used to arrive as 1000 — a different id than the caller wrote.
  it("rejects partial, non-positive, and coerced values", () => {
    for (const bad of ["123abc", "", "  ", 0, -1, 1.5, Number.NaN, "1e3", "0x10", "+7", "7.0"]) {
      expect(() => readRequiredPositiveInteger({ contactId: bad }, "contactId")).toThrow(
        "contactId must be a positive integer"
      );
    }
  });

  it("rejects a missing value instead of returning undefined", () => {
    expect(() => readRequiredPositiveInteger({}, "contactId")).toThrow(
      "contactId must be a positive integer"
    );
  });
});
