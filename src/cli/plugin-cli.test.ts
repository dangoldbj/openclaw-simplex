import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_ID,
  LEGACY_CHANNEL_ID,
  LEGACY_PLUGIN_ID,
  PLUGIN_ID,
  migrateConfigObject,
  migrateStateFiles,
} from "./plugin-cli.js";

describe("simplex migration config", () => {
  it("migrates legacy plugin and channel ids", () => {
    const { nextConfig, result } = migrateConfigObject({
      plugins: {
        entries: {
          [LEGACY_PLUGIN_ID]: { enabled: true },
        },
        installs: {
          [LEGACY_PLUGIN_ID]: { source: "npm" },
        },
        allow: [LEGACY_PLUGIN_ID, "other"],
        deny: ["blocked", LEGACY_PLUGIN_ID],
      },
      channels: {
        [LEGACY_CHANNEL_ID]: {
          enabled: true,
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          accounts: {
            ops: {
              allowFrom: ["*"],
            },
          },
        },
      },
    });

    expect(nextConfig).toEqual({
      plugins: {
        entries: {
          [PLUGIN_ID]: { enabled: true },
        },
        installs: {
          [PLUGIN_ID]: { source: "npm" },
        },
        allow: [PLUGIN_ID, "other"],
        deny: ["blocked", PLUGIN_ID],
      },
      channels: {
        [CHANNEL_ID]: {
          enabled: true,
          connection: { wsUrl: "ws://127.0.0.1:5225" },
          accounts: {
            ops: {
              allowFrom: ["*"],
            },
          },
        },
      },
    });
    expect(result.changed).toContain(`config: plugins.entries.${LEGACY_PLUGIN_ID} -> plugins.entries.${PLUGIN_ID}`);
    expect(result.changed).toContain(`config: plugins.installs.${LEGACY_PLUGIN_ID} -> plugins.installs.${PLUGIN_ID}`);
    expect(result.changed).toContain(`config: channels.${LEGACY_CHANNEL_ID} -> channels.${CHANNEL_ID}`);
  });
});

describe("simplex migration state", () => {
  it("renames pairing and allowFrom state files", async () => {
    const stateDir = path.join(os.tmpdir(), `openclaw-simplex-test-${Date.now()}`);
    await mkdir(stateDir, { recursive: true });
    const credentialsDir = path.join(stateDir, "credentials");
    await mkdir(credentialsDir, { recursive: true });
    await writeFile(path.join(credentialsDir, `${LEGACY_CHANNEL_ID}-pairing.json`), "{}");
    await writeFile(path.join(credentialsDir, `${LEGACY_CHANNEL_ID}-allowFrom.json`), "{}");
    await writeFile(path.join(credentialsDir, `${LEGACY_CHANNEL_ID}-ops-allowFrom.json`), "{}");

    const api = {
      runtime: {
        state: {
          resolveStateDir: () => stateDir,
        },
      },
    } as any;

    const result = await migrateStateFiles(api, false);

    expect(result.changed).toEqual([
      `state: ${LEGACY_CHANNEL_ID}-allowFrom.json -> ${CHANNEL_ID}-allowFrom.json`,
      `state: ${LEGACY_CHANNEL_ID}-ops-allowFrom.json -> ${CHANNEL_ID}-ops-allowFrom.json`,
      `state: ${LEGACY_CHANNEL_ID}-pairing.json -> ${CHANNEL_ID}-pairing.json`,
    ]);

    const files = (await readdir(credentialsDir)).sort();
    expect(files).toEqual([
      `${CHANNEL_ID}-allowFrom.json`,
      `${CHANNEL_ID}-ops-allowFrom.json`,
      `${CHANNEL_ID}-pairing.json`,
    ]);
  });

  it("skips a rename when the target file already exists", async () => {
    const stateDir = path.join(os.tmpdir(), `openclaw-simplex-test-${Date.now()}-skip`);
    await mkdir(stateDir, { recursive: true });
    const credentialsDir = path.join(stateDir, "credentials");
    await mkdir(credentialsDir, { recursive: true });
    await writeFile(path.join(credentialsDir, `${LEGACY_CHANNEL_ID}-pairing.json`), "{}");
    await writeFile(path.join(credentialsDir, `${CHANNEL_ID}-pairing.json`), "{}");

    const api = {
      runtime: {
        state: {
          resolveStateDir: () => stateDir,
        },
      },
    } as any;

    const result = await migrateStateFiles(api, false);

    expect(result.changed).toEqual([]);
    expect(result.skipped).toEqual([
      `state: skipped ${LEGACY_CHANNEL_ID}-pairing.json because ${CHANNEL_ID}-pairing.json already exists`,
    ]);
  });

  it("does not write files during dry run", async () => {
    const stateDir = path.join(os.tmpdir(), `openclaw-simplex-test-${Date.now()}-dry-run`);
    await mkdir(stateDir, { recursive: true });
    const credentialsDir = path.join(stateDir, "credentials");
    await mkdir(credentialsDir, { recursive: true });
    await writeFile(path.join(credentialsDir, `${LEGACY_CHANNEL_ID}-pairing.json`), "{}");

    const api = {
      runtime: {
        state: {
          resolveStateDir: () => stateDir,
        },
      },
    } as any;

    const result = await migrateStateFiles(api, true);

    expect(result.changed).toEqual([`state: ${LEGACY_CHANNEL_ID}-pairing.json -> ${CHANNEL_ID}-pairing.json`]);
    const files = (await readdir(credentialsDir)).sort();
    expect(files).toEqual([`${LEGACY_CHANNEL_ID}-pairing.json`]);
  });
});
