import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { SimplexLogger } from "./simplex.js";

export type SimplexInviteMode = "connect" | "address";

export type SimplexInviteServiceOptions = {
  cfg: OpenClawConfig;
  accountId?: string | null;
  logger?: SimplexLogger;
};

export type SimplexInviteCreateResult = {
  accountId: string;
  operation: "create-link" | "create-address";
  mode: SimplexInviteMode;
  link: string | null;
};

export type SimplexInviteListResult = {
  accountId: string;
  addressLink: string | null;
  links: string[];
  pendingHints: string[];
  addressResponse: unknown;
  contactsResponse: unknown;
};

export type SimplexInviteRevokeResult = {
  accountId: string;
  revoked: boolean;
};
