import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listStoredSimplexContactRequests,
  recordSimplexContactRequest,
} from "../../simplex/state/contact-requests.js";
import { hasSimplexEventBeenSeen, markSimplexEventSeen } from "../../simplex/state/event-dedupe.js";
import { setSimplexRuntime } from "../runtime.js";
import { simplexLifecycle } from "./simplex-lifecycle.js";

const STAGED_TTL_MS = 5 * 60_000;
const UUID = "0f9c1b6e-2a3d-4c5f-8b7a-1d2e3f4a5b6c";

const dirs: string[] = [];

async function outboundDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simplex-outbound-"));
  dirs.push(dir);
  return dir;
}

async function writeAged(dir: string, name: string, ageMs: number): Promise<string> {
  const file = path.join(dir, name);
  await writeFile(file, "x");
  const when = new Date(Date.now() - ageMs);
  await utimes(file, when, when);
  return file;
}

function cfgWithOutbound(dir: string): OpenClawConfig {
  return {
    channels: {
      "openclaw-simplex": {
        connection: { wsUrl: "ws://127.0.0.1:5225", outboundFolder: dir },
      },
    },
  } as unknown as OpenClawConfig;
}

const log = { info: vi.fn(), warn: vi.fn() };

describe("simplex lifecycle startup maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("reclaims a staged file stranded by a previous process", async () => {
    const dir = await outboundDir();
    await writeAged(dir, `${UUID}-photo.png`, STAGED_TTL_MS * 2);

    await simplexLifecycle.runStartupMaintenance?.({ cfg: cfgWithOutbound(dir), log });

    expect(await readdir(dir)).toEqual([]);
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining("1 stranded outbound file"));
  });

  it("never deletes files it did not stage", async () => {
    const dir = await outboundDir();
    await writeAged(dir, "operator-notes.txt", STAGED_TTL_MS * 2);
    await writeAged(dir, "important.png", STAGED_TTL_MS * 10);

    await simplexLifecycle.runStartupMaintenance?.({ cfg: cfgWithOutbound(dir), log });

    expect((await readdir(dir)).toSorted()).toEqual(["important.png", "operator-notes.txt"]);
    expect(log.info).not.toHaveBeenCalled();
  });

  it("leaves a recently staged file for the in-process reaper", async () => {
    const dir = await outboundDir();
    await writeAged(dir, `${UUID}-fresh.png`, 1_000);

    await simplexLifecycle.runStartupMaintenance?.({ cfg: cfgWithOutbound(dir), log });

    expect(await readdir(dir)).toEqual([`${UUID}-fresh.png`]);
  });

  it("does nothing when no account stages outbound media", async () => {
    await simplexLifecycle.runStartupMaintenance?.({
      cfg: {
        channels: { "openclaw-simplex": { connection: { wsUrl: "ws://127.0.0.1:5225" } } },
      } as unknown as OpenClawConfig,
      log,
    });

    expect(log.info).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("reports an unreadable outbound folder without throwing", async () => {
    const cfg = cfgWithOutbound(path.join(os.tmpdir(), "simplex-outbound-missing-dir"));

    await expect(simplexLifecycle.runStartupMaintenance?.({ cfg, log })).resolves.toBeUndefined();
    expect(log.warn).not.toHaveBeenCalled();
  });
});

describe("simplex lifecycle account removal", () => {
  const runtime = { log: vi.fn(), error: vi.fn() } as unknown as RuntimeEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    setSimplexRuntime({} as object as Partial<PluginRuntime> as PluginRuntime);
  });

  it("clears the removed account's contact requests and dedupe markers", async () => {
    await recordSimplexContactRequest({
      accountId: "gone",
      contactRequest: { contactRequestId: 1, localDisplayName: "alice" },
    });
    await markSimplexEventSeen({ accountId: "gone", chatId: 5, messageId: 11 });

    await simplexLifecycle.onAccountRemoved?.({
      accountId: "gone",
      prevCfg: {} as OpenClawConfig,
      runtime,
    });

    expect(await listStoredSimplexContactRequests({ accountId: "gone" })).toEqual([]);
    expect(await hasSimplexEventBeenSeen({ accountId: "gone", chatId: 5, messageId: 11 })).toBe(
      false
    );
  });

  it("leaves other accounts untouched", async () => {
    await recordSimplexContactRequest({
      accountId: "kept",
      contactRequest: { contactRequestId: 2, localDisplayName: "bob" },
    });
    await markSimplexEventSeen({ accountId: "kept", chatId: 5, messageId: 12 });

    await simplexLifecycle.onAccountRemoved?.({
      accountId: "removed",
      prevCfg: {} as OpenClawConfig,
      runtime,
    });

    expect(await listStoredSimplexContactRequests({ accountId: "kept" })).toHaveLength(1);
    expect(await hasSimplexEventBeenSeen({ accountId: "kept", chatId: 5, messageId: 12 })).toBe(
      true
    );
  });

  it("stays quiet when the account left no state behind", async () => {
    await simplexLifecycle.onAccountRemoved?.({
      accountId: "never-used",
      prevCfg: {} as OpenClawConfig,
      runtime,
    });

    expect(runtime.log).not.toHaveBeenCalled();
    expect(runtime.error).not.toHaveBeenCalled();
  });
});
