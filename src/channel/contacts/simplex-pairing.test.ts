import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listStoredSimplexPairingRequests } from "../../simplex/state/pairing-requests.js";
import { setSimplexRuntime } from "../runtime.js";
import { registerSimplexPairingHooks } from "./simplex-pairing.js";

type PairingEvent = {
  channel: string;
  accountId?: string;
  senderId: string;
  code: string;
  metadata?: Record<string, string | undefined>;
};

function capture(): {
  emit: (event: PairingEvent) => Promise<void>;
  error: ReturnType<typeof vi.fn>;
} {
  const handlers: Array<(event: PairingEvent) => Promise<void>> = [];
  const error = vi.fn();
  registerSimplexPairingHooks({
    config: { channels: { "openclaw-simplex": { connection: { wsUrl: "ws://127.0.0.1:5225" } } } },
    logger: { error },
    on: (_name: string, handler: (event: PairingEvent) => Promise<void>) => {
      handlers.push(handler);
    },
  } as unknown as OpenClawPluginApi);
  const emit = handlers[0];
  if (!emit) {
    throw new Error("no pairing hook registered");
  }
  return { emit, error };
}

describe("simplex pairing hook", () => {
  beforeEach(() => {
    setSimplexRuntime({} as object as Partial<PluginRuntime> as PluginRuntime);
  });

  it("records a pairing request so the operator can see who is waiting", async () => {
    const { emit } = capture();

    await emit({
      channel: "openclaw-simplex",
      accountId: "default",
      senderId: "openclaw-simplex:@42",
      code: "abc123",
      metadata: { displayName: "alice" },
    });

    const stored = await listStoredSimplexPairingRequests({ accountId: "default" });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ senderId: "42", code: "abc123", displayName: "alice" });
  });

  it("ignores pairing requests from other channels", async () => {
    const { emit } = capture();

    await emit({ channel: "telegram", accountId: "other", senderId: "9", code: "zzz" });

    expect(await listStoredSimplexPairingRequests({ accountId: "other" })).toEqual([]);
  });

  it("falls back to the default account when the event carries none", async () => {
    const { emit } = capture();

    await emit({ channel: "openclaw-simplex", senderId: "77", code: "code77" });

    const stored = await listStoredSimplexPairingRequests({ accountId: "default" });
    expect(stored.some((request) => request.senderId === "77")).toBe(true);
  });

  it("logs instead of throwing when the store is unavailable", async () => {
    const { emit, error } = capture();
    setSimplexRuntime(null as unknown as PluginRuntime);

    await expect(
      emit({ channel: "openclaw-simplex", senderId: "13", code: "code13" })
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("pairing request"));
  });
});
