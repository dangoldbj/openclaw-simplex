import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveSimplexCliDefaultDbPrefix, resolveSimplexDbFilePrefix } from "./simplex-db-path.js";

describe("simplex database path helpers", () => {
  it("uses the SimpleX CLI default on unix platforms", () => {
    expect(resolveSimplexCliDefaultDbPrefix({ platform: "linux" })).toBe("~/.simplex/simplex_v1");
    expect(resolveSimplexCliDefaultDbPrefix({ platform: "darwin" })).toBe("~/.simplex/simplex_v1");
  });

  it("uses AppData for the SimpleX CLI default on Windows", () => {
    expect(
      resolveSimplexCliDefaultDbPrefix({
        platform: "win32",
        env: { APPDATA: "C:\\Users\\alice\\AppData\\Roaming" },
      })
    ).toBe(path.join("C:\\Users\\alice\\AppData\\Roaming", "simplex", "simplex_v1"));
  });

  it("expands home-relative db prefixes", () => {
    expect(resolveSimplexDbFilePrefix("~/.simplex/simplex_v1")).toContain(
      path.join(".simplex", "simplex_v1")
    );
  });
});
