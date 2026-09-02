import { describe, expect, it } from "vitest";
import { formatHuman, formatRuntimeDoctor, shouldEmitJson } from "./output.js";

describe("cli output mode", () => {
  it("keeps emitting JSON when output is redirected", () => {
    // Existing scripts pipe these commands and parse the JSON; that must not
    // change just because a human-readable mode exists.
    expect(shouldEmitJson({}, false)).toBe(true);
  });

  it("uses the human summary on a terminal", () => {
    expect(shouldEmitJson({}, true)).toBe(false);
  });

  it("honours an explicit --json even on a terminal", () => {
    expect(shouldEmitJson({ json: true }, true)).toBe(true);
  });
});

describe("formatHuman", () => {
  it("renders scalars as readable labelled lines", () => {
    expect(formatHuman({ accountId: "ops", connected: true, lastError: null })).toBe(
      ["Account id: ops", "Connected: yes", "Last error: -"].join("\n")
    );
  });

  it("indents nested objects", () => {
    expect(formatHuman({ runtime: { connected: false } })).toBe(
      ["Runtime:", "  Connected: no"].join("\n")
    );
  });

  it("marks empty collections rather than printing nothing", () => {
    expect(formatHuman({ links: [] })).toBe(["Links:", "  (none)"].join("\n"));
  });

  it("omits undefined entries", () => {
    expect(formatHuman({ a: 1, b: undefined })).toBe("A: 1");
  });
});

describe("formatRuntimeDoctor", () => {
  const base = { accountId: "ops", wsUrl: "ws://127.0.0.1:5225", runtimeVersion: "6.5.0" };

  it("states a healthy runtime plainly", () => {
    const text = formatRuntimeDoctor({ ...base, ok: true, issues: [] });

    expect(text).toContain("ws://127.0.0.1:5225");
    expect(text).toContain("looks healthy");
  });

  it("lists issues and counts them", () => {
    const text = formatRuntimeDoctor({
      ...base,
      ok: false,
      issues: [
        "SimpleX runtime has no active user profile.",
        "SimpleX transport warning: plain ws",
      ],
    });

    expect(text).toContain("Found 2 issues:");
    expect(text).toContain("- SimpleX runtime has no active user profile.");
  });

  it("uses the singular form for one issue", () => {
    const text = formatRuntimeDoctor({ ...base, ok: false, issues: ["only one"] });

    expect(text).toContain("Found 1 issue:");
  });
});
