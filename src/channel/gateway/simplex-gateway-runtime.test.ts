import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { describe, expect, it, vi } from "vitest";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";

const monitorMock = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  statusSink: undefined as undefined | ((status: Record<string, unknown>) => void),
  start: vi.fn(async (opts: { statusSink?: (status: Record<string, unknown>) => void }) => {
    monitorMock.statusSink = opts.statusSink;
    return {
      client: {
        close: monitorMock.close,
      },
    };
  }),
}));

vi.mock("../events/simplex-monitor.js", () => ({
  startSimplexMonitor: monitorMock.start,
}));

import { buildSimplexGatewayRuntime } from "./simplex-gateway-runtime.js";

function account(): ResolvedSimplexAccount {
  return testSimplexAccount({ name: "main" });
}

describe("simplex gateway runtime", () => {
  it("seeds configured running status before waiting on the external runtime", async () => {
    const gateway = buildSimplexGatewayRuntime();
    const abort = new AbortController();
    const statuses: unknown[] = [];
    type StartContext = Parameters<NonNullable<typeof gateway.startAccount>>[0];

    const running = gateway.startAccount?.({
      account: account(),
      accountId: "default",
      cfg: { channels: {} } as OpenClawConfig,
      runtime: {} as RuntimeEnv,
      abortSignal: abort.signal,
      log: {
        info() {},
        warn() {},
        error() {},
      },
      setStatus: (status: unknown) => statuses.push(status),
      getStatus: () => ({ accountId: "default" }),
    } satisfies StartContext);

    await vi.waitFor(() => expect(statuses.length).toBeGreaterThan(0));

    expect(statuses[0]).toMatchObject({
      accountId: "default",
      running: true,
      connected: false,
      lastStopAt: null,
      lastError: null,
      healthState: "starting",
    });

    await vi.waitFor(() => expect(monitorMock.start).toHaveBeenCalled());
    monitorMock.statusSink?.({
      connected: true,
      running: true,
      lastConnectedAt: 123,
      healthState: "healthy",
    });

    expect(statuses.at(-1)).toMatchObject({
      accountId: "default",
      running: true,
      connected: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    abort.abort();
    await running;
    expect(monitorMock.close).toHaveBeenCalledTimes(1);
  });
});
