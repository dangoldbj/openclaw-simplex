import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { describe, expect, it, vi } from "vitest";
import type { SimplexConnectionState } from "../../simplex/runtime/ws-client.js";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";

const clientMock = vi.hoisted(() => ({
  instances: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    emitConnectionState: (state: SimplexConnectionState) => void;
    eventListenersRegisteredBeforeConnect: () => boolean;
  }>,
  reset() {
    this.instances.length = 0;
  },
}));

vi.mock("../../simplex/runtime/client.js", () => ({
  SimplexClient: class {
    private connectionHandlers = new Set<(state: SimplexConnectionState) => void>();
    private eventHandlers = new Set<(event: unknown) => void>();
    private hadEventListenersWhenConnectStarted = false;
    readonly connect = vi.fn(async () => {
      this.hadEventListenersWhenConnectStarted = this.eventHandlers.size > 0;
    });
    readonly close = vi.fn(async () => undefined);

    constructor() {
      clientMock.instances.push({
        connect: this.connect,
        close: this.close,
        eventListenersRegisteredBeforeConnect: () => this.hadEventListenersWhenConnectStarted,
        emitConnectionState: (state) => {
          for (const handler of this.connectionHandlers) {
            handler(state);
          }
        },
      });
    }

    onConnectionState(handler: (state: SimplexConnectionState) => void): () => void {
      this.connectionHandlers.add(handler);
      return () => this.connectionHandlers.delete(handler);
    }

    onEvent(): () => void {
      const handler = () => undefined;
      this.eventHandlers.add(handler);
      return () => this.eventHandlers.delete(handler);
    }
  },
}));

import { startSimplexMonitor } from "./simplex-monitor.js";

function account(): ResolvedSimplexAccount {
  return testSimplexAccount({
    config: {
      allowFrom: [],
      groupAllowFrom: [],
      connection: { wsUrl: "ws://127.0.0.1:5225" },
    },
  });
}

describe("simplex monitor connection lifecycle", () => {
  it("reconnects after an unexpected websocket disconnect", async () => {
    clientMock.reset();
    const statuses: unknown[] = [];

    await startSimplexMonitor({
      account: account(),
      cfg: { channels: {} } as OpenClawConfig,
      runtime: {
        log() {},
        error() {},
        exit() {
          throw new Error("unexpected exit");
        },
      } as RuntimeEnv,
      abortSignal: new AbortController().signal,
      statusSink: (status) => statuses.push(status),
    });

    const client = clientMock.instances[0];
    expect(client?.connect).toHaveBeenCalledTimes(1);

    client?.emitConnectionState({
      connected: false,
      at: 123,
      expected: false,
      error: "runtime closed",
    });

    await vi.waitFor(() => expect(client?.connect).toHaveBeenCalledTimes(2));
    expect(statuses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          connected: false,
          running: true,
          healthState: "starting",
        }),
      ])
    );
  });

  it("subscribes for runtime events before opening the websocket", async () => {
    clientMock.reset();

    await startSimplexMonitor({
      account: account(),
      cfg: { channels: {} } as OpenClawConfig,
      runtime: {
        log() {},
        error() {},
        exit() {
          throw new Error("unexpected exit");
        },
      } as RuntimeEnv,
      abortSignal: new AbortController().signal,
    });

    const client = clientMock.instances[0];
    expect(client?.connect).toHaveBeenCalledTimes(1);
    expect(client?.eventListenersRegisteredBeforeConnect()).toBe(true);
  });
});
