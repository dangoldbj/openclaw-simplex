import os from "node:os";
import path from "node:path";
import type { ResolvedSimplexAccount } from "../types/config.js";
import type {
  SimplexChatApi,
  SimplexChatEvent,
  SimplexLogger,
  SimplexMigrationConfirmation,
  SimplexMigrationConfirmationSetting,
} from "../types/simplex.js";

type SimplexNodeConnectionState = {
  connected: boolean;
  at: number;
  expected?: boolean;
  error?: string | null;
};

type SimplexNodeClientParams = {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
};

export class SimplexNodeClient {
  private readonly account: ResolvedSimplexAccount;
  private readonly logger: SimplexNodeClientParams["logger"];
  private chat: SimplexChatApi | null = null;
  private connectPromise: Promise<void> | null = null;
  private eventReceiver: ((event: SimplexChatEvent) => void) | null = null;
  private readonly eventHandlers = new Set<(event: SimplexChatEvent) => void>();
  private readonly connectionHandlers = new Set<(state: SimplexNodeConnectionState) => void>();
  private closing = false;

  constructor(params: SimplexNodeClientParams) {
    this.account = params.account;
    this.logger = params.logger;
  }

  onEvent(handler: (event: SimplexChatEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  onConnectionState(handler: (state: SimplexNodeConnectionState) => void): () => void {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  async connect(): Promise<void> {
    if (this.chat?.started) {
      return;
    }
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }
    const inFlight = withTimeout(
      this.connectInternal(),
      this.account.config.connection?.connectTimeoutMs ?? 15_000,
      `SimpleX Node runtime connect timed out for account "${this.account.accountId}"`
    ).finally(() => {
      if (this.connectPromise === inFlight) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = inFlight;
    await inFlight;
  }

  async close(): Promise<void> {
    this.closing = true;
    const chat = this.chat;
    if (chat && this.eventReceiver) {
      chat.offAny(this.eventReceiver as never);
    }
    this.eventReceiver = null;
    this.chat = null;
    if (chat) {
      await chat.stopChat().catch(() => undefined);
      await chat.close().catch(() => undefined);
    }
    this.emitConnectionState({ connected: false, expected: true, at: Date.now(), error: null });
    this.closing = false;
  }

  async withApi<T>(fn: (api: SimplexChatApi) => Promise<T>): Promise<T> {
    await this.connect();
    if (!this.chat) {
      throw new Error("SimpleX Node runtime is not connected");
    }
    return await fn(this.chat);
  }

  private async connectInternal(): Promise<void> {
    const simplex = await import("simplex-chat");
    const confirm = resolveMigrationConfirmation(simplex.core.MigrationConfirmation, {
      value: this.account.config.connection?.migrationConfirmation,
    });
    const chat = await simplex.api.ChatApi.init(
      { type: "sqlite", filePrefix: resolveDbFilePrefix(this.account.dbFilePrefix) },
      confirm
    );
    this.chat = chat;
    this.eventReceiver = (event) => {
      this.emitEvent(event as SimplexChatEvent);
    };
    chat.onAny(this.eventReceiver as never);
    await ensureActiveUser({
      chat,
      displayName:
        this.account.config.connection?.displayName ?? this.account.name ?? "OpenClaw SimpleX",
      fullName: this.account.config.connection?.fullName ?? "",
    });
    await chat.startChat();
    this.logger?.info?.("SimpleX Node runtime started");
    this.emitConnectionState({ connected: true, at: Date.now(), error: null });
  }

  private emitEvent(event: SimplexChatEvent): void {
    for (const handler of [...this.eventHandlers]) {
      handler(event);
    }
  }

  private emitConnectionState(state: SimplexNodeConnectionState): void {
    if (!state.connected && this.closing) {
      state.expected = true;
    }
    for (const handler of [...this.connectionHandlers]) {
      handler(state);
    }
  }
}

function resolveDbFilePrefix(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return path.resolve(value);
}

function resolveMigrationConfirmation(
  migrationConfirmation: SimplexMigrationConfirmation,
  params: { value?: SimplexMigrationConfirmationSetting }
) {
  switch (params.value) {
    case "yesUpDown":
      return migrationConfirmation.YesUpDown;
    case "console":
      return migrationConfirmation.Console;
    case "error":
      return migrationConfirmation.Error;
    default:
      return migrationConfirmation.YesUp;
  }
}

async function ensureActiveUser(params: {
  chat: SimplexChatApi;
  displayName: string;
  fullName: string;
}): Promise<void> {
  const existing = await params.chat.apiGetActiveUser();
  if (existing) {
    return;
  }
  await params.chat.apiCreateActiveUser({
    displayName: params.displayName,
    fullName: params.fullName,
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
