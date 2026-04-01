import type { SimplexAccountConfig } from "./config-schema.js";

export type SimplexConnectionMode = "external";

export type SimplexConnectionConfig = {
  mode?: SimplexConnectionMode;
  wsUrl?: string;
  wsHost?: string;
  wsPort?: number;
  autoAcceptFiles?: boolean;
  connectTimeoutMs?: number;
};

export type ResolvedSimplexAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  configured: boolean;
  mode: SimplexConnectionMode;
  wsUrl: string;
  wsHost: string;
  wsPort: number;
  config: SimplexAccountConfig;
};
