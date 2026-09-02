import { beforeEach, describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import {
  clearSimplexDirectoryProbeCache,
  isSimplexEmptyRuntimeListError,
  readSimplexActiveUserInfo,
  readSimplexActiveUserInfoFromClient,
  resolveSimplexDirectoryTimeoutMs,
} from "./directory-probes.js";

describe("simplex directory probe helpers", () => {
  beforeEach(() => {
    clearSimplexDirectoryProbeCache();
  });

  it("resolves directory timeout from directory, command, then default settings", () => {
    expect(
      resolveSimplexDirectoryTimeoutMs(
        testSimplexAccount({
          config: { connection: { directoryTimeoutMs: 1_000, commandTimeoutMs: 2_000 } },
        })
      )
    ).toBe(1_000);
    expect(
      resolveSimplexDirectoryTimeoutMs(
        testSimplexAccount({ config: { connection: { commandTimeoutMs: 2_000 } } })
      )
    ).toBe(2_000);
    expect(resolveSimplexDirectoryTimeoutMs(testSimplexAccount())).toBe(5_000);
  });

  it("reads active user ids and names from SimpleX user payloads", () => {
    expect(
      readSimplexActiveUserInfo({
        userId: 7,
        profile: { displayName: "OpenClaw SimpleX" },
      })
    ).toMatchObject({
      userId: "7",
      numericUserId: 7,
      displayName: "OpenClaw SimpleX",
    });
  });

  it("rejects partial numeric user ids", () => {
    expect(readSimplexActiveUserInfo({ userId: "7abc" })).toMatchObject({
      userId: "7abc",
      numericUserId: null,
    });
  });

  it("recognizes SimpleX empty-list runtime failures", () => {
    expect(isSimplexEmptyRuntimeListError(new Error("Failed reading: empty"))).toBe(true);
    expect(isSimplexEmptyRuntimeListError(new Error("Failed reading: permission denied"))).toBe(
      false
    );
  });

  it("caches active user reads briefly per account", async () => {
    const getActiveUser = vi.fn(async () => ({
      userId: 9,
      profile: { displayName: "Cached User" },
    }));
    const cfg = testSimplexAccount();

    await expect(
      readSimplexActiveUserInfoFromClient({ account: cfg, client: { getActiveUser } })
    ).resolves.toMatchObject({ numericUserId: 9 });
    await expect(
      readSimplexActiveUserInfoFromClient({ account: cfg, client: { getActiveUser } })
    ).resolves.toMatchObject({ numericUserId: 9 });

    expect(getActiveUser).toHaveBeenCalledTimes(1);
  });
});
