import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { SimplexWsClient } from "./simplex-ws-client.js";

type ServerInfo = {
  wss: WebSocketServer;
  url: string;
};

let server: ServerInfo | null = null;

function startServer(): Promise<ServerInfo> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    const cleanup = () => {
      wss.off("listening", onListening);
      wss.off("error", onError);
    };
    const onListening = () => {
      cleanup();
      const address = wss.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to bind websocket server"));
        return;
      }
      resolve({ wss, url: `ws://127.0.0.1:${address.port}` });
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    wss.on("listening", onListening);
    wss.on("error", onError);
  });
}

function stopServer(wss: WebSocketServer): Promise<void> {
  return new Promise((resolve) => wss.close(() => resolve()));
}

describe("SimplexWsClient", () => {
  beforeEach(async () => {
    server = await startServer();
  });

  afterEach(async () => {
    if (server) {
      await stopServer(server.wss);
      server = null;
    }
  });

  it("round-trips commands and emits events", async () => {
    if (!server) {
      throw new Error("server not initialized");
    }
    const events: Array<{ type: string }> = [];
    server.wss.on("connection", (socket) => {
      socket.on("message", (data) => {
        let text: string;
        if (typeof data === "string") {
          text = data;
        } else if (Buffer.isBuffer(data)) {
          text = data.toString("utf8");
        } else if (Array.isArray(data)) {
          text = Buffer.concat(data).toString("utf8");
        } else {
          text = Buffer.from(data).toString("utf8");
        }
        const parsed = JSON.parse(text) as { corrId?: string };
        socket.send(Buffer.from(JSON.stringify({ corrId: parsed.corrId, resp: { type: "ok" } })));
        socket.send(JSON.stringify({ resp: { type: "event", hello: true } }));
      });
    });

    const client = new SimplexWsClient({ url: server.url });
    client.onEvent((event) => events.push(event));

    const result = await client.sendCommand("/ping");
    expect(result.resp?.type).toBe("ok");

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events[0]?.type).toBe("event");

    await client.close();
  });

  it("rejects pending command on unexpected close and reconnects cleanly", async () => {
    if (!server) {
      throw new Error("server not initialized");
    }

    let connectionCount = 0;
    server.wss.on("connection", (socket) => {
      connectionCount += 1;
      socket.on("message", (data) => {
        let text: string;
        if (typeof data === "string") {
          text = data;
        } else if (Buffer.isBuffer(data)) {
          text = data.toString("utf8");
        } else if (Array.isArray(data)) {
          text = Buffer.concat(data).toString("utf8");
        } else {
          text = Buffer.from(data).toString("utf8");
        }
        const parsed = JSON.parse(text) as { corrId?: string };

        if (connectionCount === 1) {
          socket.close();
          return;
        }
        socket.send(Buffer.from(JSON.stringify({ corrId: parsed.corrId, resp: { type: "ok" } })));
      });
    });

    const client = new SimplexWsClient({ url: server.url });
    await expect(client.sendCommand("/first", 5_000)).rejects.toThrow("SimpleX WS closed");

    const second = await client.sendCommand("/second");
    expect(second.resp?.type).toBe("ok");

    await client.close();
  });

  it("redacts timed out command payloads", async () => {
    if (!server) {
      throw new Error("server not initialized");
    }

    server.wss.on("connection", (socket) => {
      socket.on("message", () => {
        // Intentionally do not respond.
      });
    });

    const client = new SimplexWsClient({ url: server.url });
    await expect(
      client.sendCommand(
        '/_send @123 json [{"msgContent":{"type":"text","text":"secret body"}}]',
        25
      )
    ).rejects.toThrow("SimpleX command timeout after 25ms (/_send)");
    await expect(
      client.sendCommand(
        '/_send @123 json [{"msgContent":{"type":"text","text":"secret body"}}]',
        25
      )
    ).rejects.not.toThrow("secret body");

    await client.close();
  });
});
