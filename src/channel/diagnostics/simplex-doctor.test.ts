import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import { simplexDoctor } from "./simplex-doctor.js";

describe("simplex doctor", () => {
  it("describes SimpleX policy model for OpenClaw doctor", () => {
    expect(simplexDoctor).toMatchObject({
      groupModel: "sender",
      dmAllowFromMode: "topOrNested",
      warnOnEmptyGroupSenderAllowlist: true,
    });
  });

  it("warns about legacy config, invalid websocket URLs, and empty allowlists", async () => {
    const cfg = {
      channels: {
        simplex: {
          connection: {
            wsUrl: "ws://127.0.0.1:5225",
          },
        },
        "openclaw-simplex": {
          connection: {
            wsUrl: "http://127.0.0.1:5225",
          },
          dmPolicy: "allowlist",
          allowFrom: [],
          groupPolicy: "allowlist",
          groupAllowFrom: [],
          accounts: {
            alt: {
              connection: {
                wsUrl: "tcp://127.0.0.1:5225",
              },
              dmPolicy: "allowlist",
              allowFrom: [],
              groupPolicy: "allowlist",
              groupAllowFrom: [],
            },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await (simplexDoctor.collectPreviewWarnings?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
    }) ?? []);

    expect(warnings.join("\n")).toContain("Legacy channels.simplex config is present");
    expect(warnings.join("\n")).toContain('connection.wsUrl="http://127.0.0.1:5225"');
    expect(warnings.join("\n")).toContain('dmPolicy="allowlist" is configured with an empty');
    expect(warnings.join("\n")).toContain('groupPolicy="allowlist" is configured with an empty');
    expect(warnings.join("\n")).toContain(
      'account "alt" has connection.wsUrl="tcp://127.0.0.1:5225"'
    );
  });

  it("warns about unsafe SimpleX websocket endpoint exposure", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            wsUrl: "ws://0.0.0.0:5225?token=secret",
          },
          accounts: {
            remote: {
              connection: {
                wsUrl: "ws://192.168.1.20:5225",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await (simplexDoctor.collectPreviewWarnings?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
    }) ?? []);
    const text = warnings.join("\n");

    expect(text).toContain('connection.wsUrl="ws://0.0.0.0:5225?redacted" targets 0.0.0.0');
    expect(text).not.toContain("secret");
    expect(text).toContain("plaintext WebSocket to a non-loopback host");
    expect(text).toContain('account "remote"');
  });

  it("keeps warning when unsafe remote websocket is explicitly allowed", async () => {
    const cfg = {
      channels: {
        "openclaw-simplex": {
          connection: {
            wsUrl: "ws://simplex-chat:5225",
            allowUnsafeRemoteWs: true,
          },
        },
      },
    } as OpenClawConfig;

    const warnings = await (simplexDoctor.collectPreviewWarnings?.({
      cfg,
      doctorFixCommand: "openclaw doctor --fix",
    }) ?? []);
    const text = warnings.join("\n");

    expect(text).toContain("plaintext WebSocket to a non-loopback host");
    expect(text).not.toContain("allowUnsafeRemoteWs=true");
  });
});
