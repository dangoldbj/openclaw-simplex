import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { SimplexAccountConfig } from "../config/config-schema.js";

/**
 * Identifies which SimpleX account an operation targets.
 *
 * Almost every service, gateway method, and action takes this pair, and an
 * omitted `accountId` means "the default account" everywhere. Naming it keeps
 * that convention in one place instead of restating the shape at each boundary.
 */
export type SimplexAccountScope = {
  cfg: OpenClawConfig;
  accountId?: string | null;
};

export type SimplexConnectionConfig = {
  mode?: "external";
  wsUrl?: string;
  wsHost?: string;
  wsPort?: number;
  allowUnsafeRemoteWs?: boolean;
  autoAcceptFiles?: boolean;
  /**
   * Files-folder the external runtime stores received files in (its
   * `--files-folder`). Used to resolve relative inbound file paths (the WS API
   * reports received files by name only when a files-folder is set). Defaults to
   * `~/.simplex/files`.
   */
  filesFolder?: string;
  /**
   * Directory writable by OpenClaw where outbound media is staged before
   * sending, so the runtime can read it (e.g. a shared volume). When both sides
   * mount that volume at the same path, the staged path is sent as-is. Unset =
   * legacy single-filesystem behavior (pass the local path directly).
   */
  outboundFolder?: string;
  /**
   * The `outboundFolder` directory as the external runtime sees it, when the two
   * sides mount the shared volume at *different* paths. When set (with
   * `outboundFolder`), the plugin stages into `outboundFolder` but rewrites the
   * directory prefix to this before sending, so no verbatim path is needed. No
   * effect without `outboundFolder`.
   */
  outboundFolderOnClient?: string;
  connectTimeoutMs?: number;
  commandTimeoutMs?: number;
  directoryTimeoutMs?: number;
};

export type SimplexStreamingConfig = {
  nativeTransport?: boolean;
  throttleMs?: number;
  minChars?: number;
  wordBoundary?: boolean;
};

export type SimplexFilePolicyConfig = {
  autoAccept?: boolean;
  maxSizeMb?: number;
};

export type ResolvedSimplexAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  mode: "external";
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  config: SimplexAccountConfig;
};
