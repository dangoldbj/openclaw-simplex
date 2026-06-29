import type { ResolvedSimplexAccount, SimplexBotProfile } from "../../types/config.js";
import type {
  SimplexLogger,
  SimplexRuntimeEvent,
  SimplexRuntimeResponse,
} from "../../types/simplex.js";
import type { SimplexConnectionState, SimplexTransport } from "./transport-types.js";

/**
 * Embedded native SimpleX core transport.
 *
 * Backs `SimplexClient` when an account uses `mode: "native"`, replacing the
 * external WebSocket runtime with the in-process `simplex-chat` native core.
 * `ChatApi.sendChatCmd(cmd)` and its event stream speak the same string-command
 * / JSON-event protocol the WS runtime did, so everything above this transport
 * is unchanged.
 *
 * `simplex-chat` is an OPTIONAL dependency (it is AGPL-3.0; this plugin is MIT),
 * loaded lazily via dynamic import only when native mode is actually used, so
 * default installs never fetch or load it. The module specifier is held in a
 * variable so the type checker does not require the package to be installed.
 */

// Minimal shape of the bits of the native package this transport uses.
interface NativeChatApi {
  readonly started: boolean;
  onAny(handler: (event: unknown) => void): void;
  startChat(): Promise<void>;
  stopChat(): Promise<void>;
  close(): Promise<void>;
  sendChatCmd(cmd: string): Promise<unknown>;
  apiGetActiveUser(): Promise<
    | {
        userId: number;
        profile?: {
          displayName?: string;
          fullName?: string;
          image?: string;
          peerType?: "bot" | "human";
        };
      }
    | undefined
  >;
  apiCreateActiveUser(profile: Record<string, unknown>): Promise<{ userId: number }>;
  apiUpdateProfile(userId: number, profile: Record<string, unknown>): Promise<unknown>;
  apiGetUserAddress(userId: number): Promise<{ connLinkContact?: unknown } | undefined>;
  apiCreateUserAddress(userId: number): Promise<unknown>;
  apiSetAddressSettings(
    userId: number,
    settings: { autoAccept?: boolean; welcomeMessage?: unknown; businessAddress?: boolean }
  ): Promise<void>;
}

interface NativeModule {
  api: { ChatApi: { init(db: unknown, confirm: unknown): Promise<NativeChatApi> } };
  core: { MigrationConfirmation: { YesUp: unknown } };
  util: {
    contactAddressStr(link: unknown): string;
    botAddressSettings(link: unknown): {
      autoAccept?: boolean;
      welcomeMessage?: unknown;
      businessAddress?: boolean;
    };
  };
}

/** Extract the plain text of a welcome message (stored as MsgContent or a string). */
function welcomeMessageText(welcome: unknown): string | undefined {
  if (typeof welcome === "string") return welcome || undefined;
  if (welcome && typeof welcome === "object" && "text" in welcome) {
    const text = (welcome as { text?: unknown }).text;
    return typeof text === "string" ? text || undefined : undefined;
  }
  return undefined;
}

/**
 * Render a native chat-command error for logs. The library throws an Error
 * whose message is the opaque "Chat command error (see chatError property)" and
 * attaches the structured reason on a `chatError` field; include it so a
 * rejected command is diagnosable.
 */
function describeChatError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const chatError = (err as { chatError?: unknown })?.chatError;
  if (chatError === undefined) return base;
  let serialized: string;
  try {
    serialized = JSON.stringify(chatError);
  } catch {
    serialized = String(chatError);
  }
  return `${base} ${serialized}`;
}

async function loadNativeModule(): Promise<NativeModule> {
  // Non-literal specifier: keeps tsc from requiring the optional package at
  // build time, and surfaces a friendly error if it is missing at runtime.
  const moduleName = "simplex-chat";
  try {
    return (await import(moduleName)) as unknown as NativeModule;
  } catch (err) {
    throw new Error(
      'SimpleX mode "native" requires the optional dependency "simplex-chat" ' +
        "(AGPL-3.0). Install it in the plugin's project (`npm install simplex-chat`) on a platform with a " +
        `prebuilt or buildable native addon. Original error: ${String(err)}`
    );
  }
}

type SimplexCoreClientParams = {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  /**
   * Resolves the desired bot profile (display name, avatar, peer type) at
   * connect time. Supplied by the monitor, which has the config + runtime to
   * derive defaults from agent identity. Falls back to config-only when absent.
   */
  profileResolver?: () => Promise<SimplexBotProfile>;
};

export class SimplexCoreClient implements SimplexTransport {
  private readonly account: ResolvedSimplexAccount;
  private readonly logger?: SimplexLogger;
  private readonly profileResolver?: () => Promise<SimplexBotProfile>;
  private chat: NativeChatApi | undefined;
  private connectPromise: Promise<void> | null = null;
  private readonly eventHandlers = new Set<(event: SimplexRuntimeEvent) => void>();
  private readonly connectionHandlers = new Set<(state: SimplexConnectionState) => void>();
  private lastConnectionState: SimplexConnectionState = {
    connected: false,
    at: Date.now(),
    expected: true,
    error: null,
  };

  constructor(params: SimplexCoreClientParams) {
    this.account = params.account;
    this.logger = params.logger;
    this.profileResolver = params.profileResolver;
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
    if (this.chat?.started) {
      return;
    }
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }
    const attempt = (async () => {
      try {
        const db = this.account.db;
        if (!db?.filePrefix) {
          throw new Error(
            `SimpleX account "${this.account.accountId}" uses mode "native" but has no db.filePrefix configured`
          );
        }
        const { api, core, util } = await loadNativeModule();
        const chat = await api.ChatApi.init(
          { type: "sqlite", filePrefix: db.filePrefix, encryptionKey: db.encryptionKey },
          core.MigrationConfirmation.YesUp
        );
        // Fan every core event out to subscribers (same role as WS "message").
        chat.onAny((event) => this.handleEvent(event as SimplexRuntimeEvent));
        this.chat = chat;
        // The native core requires an active user to EXIST before startChat()
        // (it errors with `noActiveUser` otherwise); profile updates and the
        // address can only happen once the core is running.
        const desired = await this.resolveDesiredProfile();
        this.logger?.info?.(
          `SimpleX bot profile resolved: "${desired.displayName}" (peerType: ${desired.peerType}, image: ${desired.image ? "yes" : "none"})`
        );
        await this.ensureUser(desired);
        await chat.startChat();
        await this.configureServers();
        await this.reconcileProfile(desired);
        await this.ensureAddress(util);
        this.logger?.info?.(`SimpleX native core started (db: ${db.filePrefix})`);
        this.emitConnectionState({ connected: true, at: Date.now(), error: null });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.chat = undefined;
        this.emitConnectionState({
          connected: false,
          at: Date.now(),
          expected: false,
          error: error.message,
        });
        throw error;
      }
    })();
    const inFlight = attempt.finally(() => {
      if (this.connectPromise === inFlight) {
        this.connectPromise = null;
      }
    });
    this.connectPromise = inFlight;
    await inFlight;
  }

  async close(): Promise<void> {
    const chat = this.chat;
    this.chat = undefined;
    if (chat) {
      await chat.stopChat().catch(() => undefined);
      await chat.close().catch(() => undefined);
    }
    this.emitConnectionState({ connected: false, at: Date.now(), expected: true, error: null });
  }

  /**
   * Drop-in for `SimplexWsClient.sendCommand`: wraps the native `ChatResponse`
   * in the `{ resp }` envelope `unwrapSimplexCommandResponse` expects.
   */
  async sendCommand(cmd: string): Promise<SimplexRuntimeResponse> {
    if (!this.chat?.started) {
      await this.connect();
    }
    if (!this.chat) {
      throw new Error("SimpleX native core not connected");
    }
    const resp = (await this.chat.sendChatCmd(cmd)) as { type: string; [key: string]: unknown };
    return { resp };
  }

  /** Desired profile, from the injected resolver or a config-only fallback. */
  private async resolveDesiredProfile(): Promise<SimplexBotProfile> {
    if (this.profileResolver) {
      try {
        return await this.profileResolver();
      } catch (err) {
        this.logger?.warn?.(`SimpleX profile resolution failed, using fallback: ${String(err)}`);
      }
    }
    const p = this.account.profile;
    // The avatar is intentionally omitted from this fallback: image handling
    // (load, downscale, re-encode) lives in the profile resolver, so the
    // config-only path never sends a raw or oversized image.
    return {
      displayName: p?.displayName?.trim() || this.account.name?.trim() || "OpenClaw",
      fullName: p?.fullName ?? "",
      peerType: p?.peerType ?? "bot",
    };
  }

  private profileFields(profile: SimplexBotProfile): Record<string, unknown> {
    return {
      displayName: profile.displayName,
      fullName: profile.fullName,
      peerType: profile.peerType,
      ...(profile.image ? { image: profile.image } : {}),
    };
  }

  /** Create the active user if none exists. Must run BEFORE startChat(). */
  private async ensureUser(desired: SimplexBotProfile): Promise<void> {
    if (!this.chat) return;
    const existing = await this.chat.apiGetActiveUser();
    if (existing) return;
    await this.chat.apiCreateActiveUser(this.profileFields(desired));
  }

  /** Update the profile to match desired if it has drifted. Must run AFTER startChat(). */
  private async reconcileProfile(desired: SimplexBotProfile): Promise<void> {
    if (!this.chat) return;
    const user = await this.chat.apiGetActiveUser();
    if (!user) return;
    const cur = user.profile;
    const drifted =
      (cur?.displayName ?? "") !== desired.displayName ||
      (cur?.fullName ?? "") !== desired.fullName ||
      (cur?.image ?? undefined) !== (desired.image ?? undefined) ||
      (cur?.peerType ?? "bot") !== desired.peerType;
    if (drifted) {
      await this.chat.apiUpdateProfile(user.userId, this.profileFields(desired));
      this.logger?.info?.(`SimpleX bot profile updated (${desired.displayName})`);
    }
  }

  private async ensureAddress(util: NativeModule["util"]): Promise<void> {
    if (!this.chat) return;
    const user = await this.chat.apiGetActiveUser();
    if (!user) return;
    let address = await this.chat.apiGetUserAddress(user.userId);
    if (!address) {
      await this.chat.apiCreateUserAddress(user.userId);
      address = await this.chat.apiGetUserAddress(user.userId);
    }
    const settings = this.account.addressSettings;
    const desired = {
      autoAccept: settings?.autoAccept ?? true,
      welcomeMessage: settings?.welcomeMessage,
      businessAddress: settings?.businessAddress ?? false,
    };
    // Only update settings when they differ from what's stored, mirroring the
    // library's bot.run, so we don't make an interactive network call on every
    // restart. Welcome message is compared by text (it is stored as MsgContent).
    let current: ReturnType<NativeModule["util"]["botAddressSettings"]> | undefined;
    if (address) {
      try {
        current = util.botAddressSettings(address);
      } catch {
        current = undefined;
      }
    }
    const drifted =
      !current ||
      (current.autoAccept ?? true) !== desired.autoAccept ||
      (current.businessAddress ?? false) !== desired.businessAddress ||
      welcomeMessageText(current.welcomeMessage) !== welcomeMessageText(desired.welcomeMessage);
    if (drifted) {
      await this.chat.apiSetAddressSettings(user.userId, desired);
      this.logger?.info?.("SimpleX bot address settings updated");
    }
    if (address?.connLinkContact) {
      try {
        this.logger?.info?.(
          `SimpleX bot address: ${util.contactAddressStr(address.connLinkContact)}`
        );
      } catch {
        // address link formatting is best-effort
      }
    }
  }

  /**
   * Apply custom SMP/XFTP servers. Maps to the console `/smp` and `/xftp`
   * commands the core exposes via `sendChatCmd` (which dispatch to
   * `SetUserProtoServers`). Must run AFTER startChat(). Multiple servers are
   * space-separated (the `/smp` and `/xftp` parsers split on whitespace).
   *
   * A rejected configuration throws and aborts startup rather than falling back
   * to the default servers: an operator who sets `connection.servers` is opting
   * out of the presets (self-hosting, privacy, compliance), so silently routing
   * over the defaults would violate that intent. Errors here are deterministic
   * (bad URI / fingerprint), so failing fast surfaces them immediately.
   */
  private async configureServers(): Promise<void> {
    if (!this.chat) return;
    const servers = this.account.servers;
    if (!servers) return;
    const groups: Array<{ kind: "smp" | "xftp"; uris: string[] }> = [
      { kind: "smp", uris: (servers.smp ?? []).map((s) => s.trim()).filter(Boolean) },
      { kind: "xftp", uris: (servers.xftp ?? []).map((s) => s.trim()).filter(Boolean) },
    ];
    for (const { kind, uris } of groups) {
      if (uris.length === 0) continue;
      const cmd = `/${kind} ${uris.join(" ")}`;
      try {
        await this.chat.sendChatCmd(cmd);
      } catch (err) {
        // The native library throws on a chat-command error and tucks the
        // structured reason on a `chatError` property; surface it so a rejected
        // server config is diagnosable instead of an opaque one-liner.
        const detail = describeChatError(err);
        throw new Error(
          `SimpleX custom ${kind.toUpperCase()} server configuration failed: ${detail}. ` +
            `Verify each "${kind}" entry in connection.servers is a full ` +
            `${kind}://<fingerprint>@host URI reachable from the gateway.`
        );
      }
      this.logger?.info?.(`SimpleX custom ${kind.toUpperCase()} servers applied (${uris.length})`);
    }
  }

  private handleEvent(event: SimplexRuntimeEvent): void {
    if (!event || typeof event.type !== "string") {
      return;
    }
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (err) {
        this.logger?.error?.(`SimpleX native event handler error: ${String(err)}`);
      }
    }
  }

  private emitConnectionState(state: SimplexConnectionState): void {
    this.lastConnectionState = { ...state };
    for (const handler of this.connectionHandlers) {
      handler(state);
    }
  }
}
