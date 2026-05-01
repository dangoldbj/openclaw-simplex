import type { SimplexAccountConfig } from "../config/config-schema.js";

export type SimplexConnectionConfig = {
  dbFilePrefix?: string;
  displayName?: string;
  fullName?: string;
  migrationConfirmation?: "yesUp" | "yesUpDown" | "console" | "error";
  autoAcceptFiles?: boolean;
  connectTimeoutMs?: number;
};

export type ResolvedSimplexAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  mode: "node";
  dbFilePrefix: string;
  config: SimplexAccountConfig;
};
