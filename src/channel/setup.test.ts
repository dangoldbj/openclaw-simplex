import { readFileSync } from "node:fs";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { describe, expect, it } from "vitest";
import { SIMPLEX_SETUP_FIELDS, simplexSetupContract } from "./setup.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
);

function apply(input: unknown, cfg: OpenClawConfig = { channels: {} } as OpenClawConfig) {
  const parsed = simplexSetupContract.parseInput(input);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  const accountId =
    simplexSetupContract.resolveAccountId?.({ cfg, input: parsed.value }) ?? "default";
  const error = simplexSetupContract.validateInput?.({ cfg, accountId, input: parsed.value });
  if (error) {
    throw new Error(error);
  }
  const next = simplexSetupContract.applyAccountConfig({ cfg, accountId, input: parsed.value });
  const channel = (next.channels as Record<string, Record<string, unknown>>)["openclaw-simplex"];
  if (!channel) {
    throw new Error("setup wrote no SimpleX channel config");
  }
  return { accountId, channel };
}

describe("simplex setup contract", () => {
  it("keeps package.json setup fields in step with the contract", () => {
    // The CLI reads setup fields from package metadata before the plugin
    // runtime loads, so a drift here silently drops the flags.
    expect(packageJson.openclaw.channel.setup.fields).toEqual(simplexSetupContract.metadata.fields);
  });

  it("declares each field with a flag matching its key", () => {
    for (const [key, field] of Object.entries(SIMPLEX_SETUP_FIELDS)) {
      const long = field.cli.flags.split(" ")[0]?.replace(/^--/, "") ?? "";
      const camel = long.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
      expect(camel).toBe(key);
    }
  });

  it("writes the loopback default when no endpoint is given", () => {
    const { accountId, channel } = apply({});

    expect(accountId).toBe("default");
    expect(channel.connection).toMatchObject({
      mode: "external",
      wsHost: "127.0.0.1",
      wsPort: 5225,
    });
    expect(channel.enabled).toBe(true);
  });

  it("writes an explicit runtime URL instead of host and port", () => {
    const { channel } = apply({ wsUrl: "ws://127.0.0.1:5300" });

    expect(channel.connection).toMatchObject({ mode: "external", wsUrl: "ws://127.0.0.1:5300" });
    expect(channel.connection).not.toHaveProperty("wsHost");
    expect(channel.connection).not.toHaveProperty("wsPort");
  });

  it("accepts a loopback port override", () => {
    const { channel } = apply({ wsHost: "localhost", wsPort: 5300 });

    expect(channel.connection).toMatchObject({ wsHost: "localhost", wsPort: 5300 });
  });

  it("blocks a plaintext remote host given as host and port", () => {
    expect(() => apply({ wsHost: "10.0.0.5", wsPort: 5300 })).toThrow(/allowUnsafeRemoteWs=true/);
  });

  it("records the shared outbound folder for split-filesystem runtimes", () => {
    const { channel } = apply({ wsUrl: "wss://simplex.example:443", outboundFolder: "/srv/out" });

    expect(channel.connection).toMatchObject({ outboundFolder: "/srv/out" });
  });

  it("names the account from the setup name", () => {
    const { accountId } = apply({ name: "work" });

    expect(accountId).toBe("work");
  });

  it("still prefers an explicitly requested account id", () => {
    const parsed = simplexSetupContract.parseInput({ name: "work" });
    const accountId = simplexSetupContract.resolveAccountId?.({
      cfg: { channels: {} } as OpenClawConfig,
      accountId: "ops",
      input: parsed.ok ? parsed.value : {},
    });

    expect(accountId).toBe("ops");
  });

  it("rejects a runtime URL that is not a WebSocket URL", () => {
    expect(() => apply({ wsUrl: "https://simplex.example" })).toThrow(/ws:\/\/ or wss:\/\//);
  });

  it("rejects an ambiguous endpoint", () => {
    expect(() => apply({ wsUrl: "ws://simplex:5225", wsPort: 5300 })).toThrow(
      /either --ws-url or --ws-host/
    );
  });

  it("blocks a plaintext remote runtime unless it is explicitly allowed", () => {
    expect(() => apply({ wsUrl: "ws://simplex.internal:5225" })).toThrow(
      /allowUnsafeRemoteWs=true/
    );
  });

  it("accepts a plaintext remote runtime once opted in", () => {
    const { channel } = apply({
      wsUrl: "ws://simplex.internal:5225",
      allowUnsafeRemoteWs: true,
    });

    expect(channel.connection).toMatchObject({
      wsUrl: "ws://simplex.internal:5225",
      allowUnsafeRemoteWs: true,
    });
  });

  it("accepts a remote runtime over TLS without the opt-in", () => {
    const { channel } = apply({ wsUrl: "wss://simplex.example:443" });

    expect(channel.connection).toMatchObject({ wsUrl: "wss://simplex.example:443" });
    expect(channel.connection).not.toHaveProperty("allowUnsafeRemoteWs");
  });

  it("blocks a runtime bound to an unsafe interface", () => {
    expect(() => apply({ wsHost: "0.0.0.0" })).toThrow(/0\.0\.0\.0/);
  });

  it("rejects a port outside the valid range", () => {
    expect(() => apply({ wsPort: 70000 })).toThrow(/between 1 and 65535/);
  });

  it("rejects an option this channel does not own", () => {
    const parsed = simplexSetupContract.parseInput({ token: "nope" });

    expect(parsed).toMatchObject({ ok: false, error: "Unsupported setup option: token" });
  });

  it("rejects a port that is not an integer", () => {
    const parsed = simplexSetupContract.parseInput({ wsPort: "not-a-port" });

    expect(parsed.ok).toBe(false);
  });
});
