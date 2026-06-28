import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type {
  SimplexLogger,
  SimplexRuntimeEvent,
  SimplexRuntimeResponse,
} from "../../types/simplex.js";
import type { SimplexConnectionState, SimplexTransport } from "./transport-types.js";

export type { SimplexConnectionState } from "./transport-types.js";

type SimplexWsClientOptions = {
  url: string;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  maxPayloadBytes?: number;
  logger?: SimplexLogger;
};

type PendingCommand = {
  resolve: (value: SimplexRuntimeResponse) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
};

export class SimplexWsClient implements SimplexTransport {
  private readonly url: string;
  private readonly connectTimeoutMs: number;
  private readonly commandTimeoutMs: number;
  private readonly maxPayloadBytes: number;
  private readonly logger?: SimplexLogger;
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private pending = new Map<string, PendingCommand>();
  private eventHandlers = new Set<(event: SimplexRuntimeEvent) => void>();
  private connectionHandlers = new Set<(state: SimplexConnectionState) => void>();
  private lastConnectionState: SimplexConnectionState = {
    connected: false,
    at: Date.now(),
    expected: true,
    error: null,
  };
  private closing = false;

  constructor(options: SimplexWsClientOptions) {
    this.url = options.url;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 15_000;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 20_000;
    this.maxPayloadBytes = options.maxPayloadBytes ?? 16 * 1024 * 1024;
    this.logger = options.logger;
  }

  onEvent(handler: (event: SimplexRuntimeEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  onConnectionState(handler: (state: SimplexConnectionState) => void): () => void {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  getConnectionState(): SimplexConnectionState {
    return { ...this.lastConnectionState };
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }
    const connectAttempt = new Promise<void>((resolve, reject) => {
      let settled = false;
      let opened = false;

      const settleResolve = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const settleReject = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      const ws = new WebSocket(this.url, { maxPayload: this.maxPayloadBytes });
      this.ws = ws;
      this.closing = false;

      const timeout = setTimeout(() => {
        const timeoutError = new Error(
          `SimpleX WS connect timeout after ${this.connectTimeoutMs}ms`
        );
        this.handleSocketDisconnect(ws, timeoutError);
        ws.terminate();
        settleReject(timeoutError);
      }, this.connectTimeoutMs);

      ws.on("open", () => {
        opened = true;
        clearTimeout(timeout);
        this.logger?.info?.(`SimpleX WS connected: ${this.url}`);
        this.emitConnectionState({ connected: true, at: Date.now(), error: null });
        settleResolve();
      });

      ws.on("message", (data) => {
        this.handleMessage(data);
      });

      ws.on("close", (code, reason) => {
        clearTimeout(timeout);
        const closeReason = Buffer.from(reason).toString("utf8") || "unknown reason";
        const closeError = new Error(`SimpleX WS closed (code=${code}, reason=${closeReason})`);
        this.handleSocketDisconnect(ws, closeError);
        if (!opened) {
          settleReject(closeError);
        }
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger?.error?.(`SimpleX WS error: ${String(error)}`);
        this.handleSocketDisconnect(ws, error);
        settleReject(error);
      });
    });
    const inFlight = connectAttempt.finally(() => {
      if (this.connectPromise === inFlight) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = inFlight;
    await inFlight;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("SimpleX WS failed to connect");
    }
  }

  async close(): Promise<void> {
    this.rejectAllPending(new Error("SimpleX WS closed"));
    this.closing = true;
    const ws = this.ws;
    if (
      ws &&
      (ws.readyState === WebSocket.CONNECTING ||
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CLOSING)
    ) {
      await new Promise<void>((resolve) => {
        let settled = false;
        const done = () => {
          if (!settled) {
            settled = true;
            ws.off("close", done);
            ws.off("error", done);
            resolve();
          }
        };
        ws.once("close", done);
        ws.once("error", done);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        } else {
          ws.terminate();
        }
      });
    }
    this.ws = null;
    this.closing = false;
  }

  async sendCommand(
    cmd: string,
    timeoutMs = this.commandTimeoutMs
  ): Promise<SimplexRuntimeResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    const corrId = randomUUID();
    const payload = JSON.stringify({ corrId, cmd });
    return await new Promise<SimplexRuntimeResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(corrId);
        reject(
          new Error(`SimpleX command timeout after ${timeoutMs}ms (${summarizeCommand(cmd)})`)
        );
      }, timeoutMs);
      this.pending.set(corrId, { resolve, reject, timeout });
      this.ws?.send(payload, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pending.delete(corrId);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
    });
  }

  private handleMessage(raw: WebSocket.RawData): void {
    const text = rawToString(raw);
    if (!text) {
      this.logger?.warn?.("SimpleX WS message had unsupported payload type");
      return;
    }
    let parsed: SimplexRuntimeResponse;
    try {
      parsed = JSON.parse(text) as SimplexRuntimeResponse;
    } catch (err) {
      this.logger?.warn?.(`SimpleX WS parse error: ${String(err)}`);
      return;
    }

    const corrId = parsed.corrId;
    if (corrId && this.pending.has(corrId)) {
      const pending = this.pending.get(corrId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(corrId);
        pending.resolve(parsed);
        return;
      }
    }

    const event = parsed.resp;
    if (!event || typeof event.type !== "string") {
      this.logger?.debug?.("SimpleX WS message missing event type");
      return;
    }

    for (const handler of this.eventHandlers) {
      handler(event as SimplexRuntimeEvent);
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [corrId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(corrId);
    }
  }

  private handleSocketDisconnect(ws: WebSocket, error: Error): void {
    if (this.ws !== ws) {
      return;
    }
    const expected = this.closing;
    this.ws = null;
    this.rejectAllPending(error);
    this.emitConnectionState({
      connected: false,
      at: Date.now(),
      expected,
      error: expected ? null : error.message,
    });
  }

  private emitConnectionState(state: SimplexConnectionState): void {
    this.lastConnectionState = { ...state };
    for (const handler of this.connectionHandlers) {
      handler(state);
    }
  }
}

function rawToString(raw: WebSocket.RawData): string | null {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw instanceof Buffer) {
    return raw.toString("utf8");
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString("utf8");
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString("utf8");
  }
  return null;
}

function summarizeCommand(cmd: string): string {
  const firstToken = cmd.trim().split(/\s+/, 1)[0];
  return firstToken || "unknown command";
}
