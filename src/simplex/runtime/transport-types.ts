import type { SimplexRuntimeEvent, SimplexRuntimeResponse } from "../../types/simplex.js";

/**
 * Connection state reported by a transport. For the external WebSocket runtime
 * this tracks socket open/close; for the embedded native core it tracks
 * core started/stopped (native has no socket to drop, so it never emits an
 * unexpected disconnect).
 */
export type SimplexConnectionState = {
  connected: boolean;
  at: number;
  expected?: boolean;
  error?: string | null;
};

/**
 * Common surface shared by every SimpleX transport. `SimplexClient` depends
 * only on this interface, so the underlying transport (external WebSocket
 * runtime via `SimplexWsClient`, or embedded native core via
 * `SimplexCoreClient`) can be selected by account mode without any change to
 * the command/event layers above it.
 */
export interface SimplexTransport {
  onEvent(handler: (event: SimplexRuntimeEvent) => void): () => void;
  onConnectionState(handler: (state: SimplexConnectionState) => void): () => void;
  getConnectionState(): SimplexConnectionState;
  connect(): Promise<void>;
  close(): Promise<void>;
  sendCommand(cmd: string, timeoutMs?: number): Promise<SimplexRuntimeResponse>;
}
