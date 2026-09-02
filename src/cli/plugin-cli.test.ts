import { mkdir, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_SIMPLEX_CHANNEL_ID,
  LEGACY_SIMPLEX_PLUGIN_ID,
  SIMPLEX_CHANNEL_ID,
  SIMPLEX_PLUGIN_ID,
} from "../constants.js";
import { runMigration } from "./migration.js";
import {
  applyOutputOptions,
  migrateConfigObject,
  migrateStateFiles,
  registerSimplexCliMetadata,
} from "./plugin-cli.js";

const CHANNEL_ID = SIMPLEX_CHANNEL_ID;
const LEGACY_CHANNEL_ID = LEGACY_SIMPLEX_CHANNEL_ID;
const LEGACY_PLUGIN_ID = LEGACY_SIMPLEX_PLUGIN_ID;
const PLUGIN_ID = SIMPLEX_PLUGIN_ID;

class FakeCliCommand {
  constructor(
    private readonly path: string[],
    private readonly commands: string[][]
  ) {}

  command(name: string): FakeCliCommand {
    const commandPath = [...this.path, name];
    this.commands.push(commandPath);
    return new FakeCliCommand(commandPath, this.commands);
  }

  alias(): this {
    return this;
  }

  description(): this {
    return this;
  }

  option(): this {
    return this;
  }

  requiredOption(): this {
    return this;
  }

  action(): this {
    return this;
  }
}

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
          connection: {},
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
          connection: {
            mode: "external",
          },
          accounts: {
            ops: {
              allowFrom: ["*"],
            },
          },
        },
      },
    });
    expect(result.changed).toContain(
      `config: plugins.entries.${LEGACY_PLUGIN_ID} -> plugins.entries.${PLUGIN_ID}`
    );
    expect(result.changed).toContain(
      `config: plugins.installs.${LEGACY_PLUGIN_ID} -> plugins.installs.${PLUGIN_ID}`
    );
    expect(result.changed).toContain(
      `config: channels.${LEGACY_CHANNEL_ID} -> channels.${CHANNEL_ID}`
    );
  });

  it("removes legacy WebSocket and CLI runtime config while preserving policies and accounts", () => {
    const { nextConfig, result } = migrateConfigObject({
      channels: {
        [LEGACY_CHANNEL_ID]: {
          enabled: true,
          wsUrl: "ws://127.0.0.1:5225",
          managed: true,
          cliPath: "/usr/local/bin/simplex-chat",
          connection: {
            wsUrl: "ws://127.0.0.1:5225",
            authToken: "legacy-token",
            dbFilePrefix: "~/.openclaw/simplex/kept",
            connectTimeoutMs: 7000,
          },
          dmPolicy: "pairing",
          allowFrom: ["alice"],
          accounts: {
            ops: {
              name: "Ops",
              allowFrom: ["bob"],
              groupAllowFrom: ["group:ops"],
              connection: {
                wsUrl: "ws://127.0.0.1:5226",
                displayName: "Ops Bot",
              },
            },
          },
        },
      },
    });

    expect(nextConfig.channels).toEqual({
      [CHANNEL_ID]: {
        enabled: true,
        connection: {
          wsUrl: "ws://127.0.0.1:5225",
          connectTimeoutMs: 7000,
          mode: "external",
        },
        dmPolicy: "pairing",
        allowFrom: ["alice"],
        accounts: {
          ops: {
            name: "Ops",
            allowFrom: ["bob"],
            groupAllowFrom: ["group:ops"],
            connection: {
              wsUrl: "ws://127.0.0.1:5226",
              mode: "external",
            },
          },
        },
      },
    });
    expect(result.changed).toContain(
      `config: channels.${LEGACY_CHANNEL_ID} -> channels.${CHANNEL_ID}`
    );
    expect(result.changed).toContain(
      `config: removed legacy runtime field(s) from channels.${CHANNEL_ID}: cliPath, managed, wsUrl`
    );
    expect(result.changed).toContain(
      `config: removed legacy runtime field(s) from channels.${CHANNEL_ID}.connection: authToken, dbFilePrefix`
    );
    expect(result.changed).toContain(
      `config: removed legacy runtime field(s) from channels.${CHANNEL_ID}.accounts.ops.connection: displayName`
    );
  });

  it("normalizes already-renamed configs when migrate is run after a partial manual upgrade", () => {
    const { nextConfig, result } = migrateConfigObject({
      channels: {
        [CHANNEL_ID]: {
          connection: {
            wsUrl: "ws://localhost:5225",
            fullName: "SimpleX Agent",
          },
          accounts: {
            support: {
              managed: false,
              connection: {
                token: "old",
                autoAcceptFiles: false,
              },
            },
          },
        },
      },
    });

    expect(nextConfig.channels).toEqual({
      [CHANNEL_ID]: {
        connection: {
          wsUrl: "ws://localhost:5225",
          mode: "external",
        },
        accounts: {
          support: {
            connection: {
              autoAcceptFiles: false,
              mode: "external",
            },
          },
        },
      },
    });
    expect(result.changed).toContain(
      `config: removed legacy runtime field(s) from channels.${CHANNEL_ID}.connection: fullName`
    );
    expect(result.changed).toContain(
      `config: removed legacy runtime field(s) from channels.${CHANNEL_ID}.accounts.support: managed`
    );
    expect(result.changed).toContain(
      `config: removed legacy runtime field(s) from channels.${CHANNEL_ID}.accounts.support.connection: token`
    );
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
    };

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
    };

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
    };

    const result = await migrateStateFiles(api, true);

    expect(result.changed).toEqual([
      `state: ${LEGACY_CHANNEL_ID}-pairing.json -> ${CHANNEL_ID}-pairing.json`,
    ]);
    const files = (await readdir(credentialsDir)).sort();
    expect(files).toEqual([`${LEGACY_CHANNEL_ID}-pairing.json`]);
  });
});

describe("simplex migration command", () => {
  it("uses the runtime config snapshot and explicit replacement writer", async () => {
    const stateDir = path.join(os.tmpdir(), `openclaw-simplex-test-${Date.now()}-runtime`);
    const writes: unknown[] = [];
    const api = {
      runtime: {
        config: {
          current: () => ({
            channels: {
              [CHANNEL_ID]: {
                connection: {
                  wsUrl: "ws://127.0.0.1:5225",
                  dbFilePrefix: "~/.openclaw/simplex/kept",
                },
              },
            },
          }),
          replaceConfigFile: async (params: unknown) => {
            writes.push(params);
          },
          loadConfig: () => {
            throw new Error("deprecated loadConfig() must not be used");
          },
          writeConfigFile: () => {
            throw new Error("deprecated writeConfigFile() must not be used");
          },
        },
        state: {
          resolveStateDir: () => stateDir,
        },
      },
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await runMigration(api as object as Partial<OpenClawPluginApi> as OpenClawPluginApi, false);
    } finally {
      log.mockRestore();
    }

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual({
      nextConfig: {
        plugins: {},
        channels: {
          [CHANNEL_ID]: {
            connection: {
              wsUrl: "ws://127.0.0.1:5225",
              mode: "external",
            },
          },
        },
      },
      afterWrite: {
        mode: "restart",
        reason: "SimpleX migration updated plugin or channel configuration",
      },
    });
  });
});

describe("simplex cli metadata", () => {
  it("registers operator commands for runtime, requests, groups, links, and migration", () => {
    const commands: string[][] = [];
    const api = {
      registerCli: (registrar: (ctx: { program: FakeCliCommand }) => void) => {
        registrar({ program: new FakeCliCommand([], commands) });
      },
    };

    registerSimplexCliMetadata(api as object as Partial<OpenClawPluginApi> as OpenClawPluginApi);

    expect(commands).toEqual(
      expect.arrayContaining([
        [PLUGIN_ID],
        [PLUGIN_ID, "migrate"],
        [PLUGIN_ID, "invite"],
        [PLUGIN_ID, "invite", "create"],
        [PLUGIN_ID, "invite", "list"],
        [PLUGIN_ID, "invite", "revoke"],
        [PLUGIN_ID, "address"],
        [PLUGIN_ID, "address", "show"],
        [PLUGIN_ID, "address", "create"],
        [PLUGIN_ID, "address", "revoke"],
        [PLUGIN_ID, "runtime"],
        [PLUGIN_ID, "runtime", "status"],
        [PLUGIN_ID, "runtime", "doctor"],
        [PLUGIN_ID, "runtime", "service"],
        [PLUGIN_ID, "runtime", "service", "install"],
        [PLUGIN_ID, "requests"],
        [PLUGIN_ID, "requests", "list"],
        [PLUGIN_ID, "requests", "accept"],
        [PLUGIN_ID, "requests", "reject"],
        [PLUGIN_ID, "groups"],
        [PLUGIN_ID, "groups", "create"],
        [PLUGIN_ID, "groups", "link"],
        [PLUGIN_ID, "groups", "link", "create"],
        [PLUGIN_ID, "groups", "link", "list"],
        [PLUGIN_ID, "groups", "link", "revoke"],
        [PLUGIN_ID, "connect"],
        [PLUGIN_ID, "connect", "plan"],
        [PLUGIN_ID, "connect", "run"],
      ])
    );
  });
});

describe("cli output options", () => {
  type FakeCommand = {
    name: string;
    commands: FakeCommand[];
    options: string[];
    hooks: string[];
    option: (flags: string) => FakeCommand;
    opts: () => Record<string, unknown>;
    hook: (event: string) => FakeCommand;
  };

  function fakeCommand(name: string, children: FakeCommand[] = []): FakeCommand {
    const cmd: FakeCommand = {
      name,
      commands: children,
      options: [],
      hooks: [],
      option: (flags: string) => {
        cmd.options.push(flags);
        return cmd;
      },
      opts: () => ({}),
      hook: (event: string) => {
        cmd.hooks.push(event);
        return cmd;
      },
    };
    return cmd;
  }

  it("adds --json to leaf commands only", () => {
    const leaf = fakeCommand("list");
    const group = fakeCommand("invite", [leaf]);
    const root = fakeCommand("openclaw-simplex", [group]);

    applyOutputOptions(root);

    expect(leaf.options).toEqual(["--json"]);
    // Option groups do not run actions, so a flag there would be dead help text.
    expect(group.options).toEqual([]);
    expect(root.hooks).toEqual(["preAction"]);
  });

  it("does not throw when the host provides a reduced command object", () => {
    // Output formatting is a convenience; it must never break registration.
    expect(() => applyOutputOptions({})).not.toThrow();
  });
});
