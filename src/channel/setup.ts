import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { ChannelSetupAdapter, ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";
import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
} from "openclaw/plugin-sdk/setup";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";

type SimplexSetupInput = ChannelSetupInput & {
  cliPath?: string;
  httpUrl?: string;
  url?: string;
};

function resolveSetupAccountId(params: {
  cfg: OpenClawConfig;
  accountId?: string;
  input?: ChannelSetupInput;
}): string {
  const explicit = normalizeAccountId(params.accountId);
  if (explicit) {
    return explicit;
  }
  const fromName = typeof params.input?.name === "string" ? params.input.name.trim() : "";
  return normalizeAccountId(fromName || DEFAULT_ACCOUNT_ID);
}

export const simplexSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: resolveSetupAccountId,
  applyAccountName: ({ cfg, accountId, name }) => {
    return applyAccountNameToChannelSection({
      cfg,
      channelKey: SIMPLEX_CHANNEL_ID,
      accountId,
      name,
    });
  },
  applyAccountConfig: ({ cfg, accountId }) => {
    return applySetupAccountConfigPatch({
      cfg,
      channelKey: SIMPLEX_CHANNEL_ID,
      accountId,
      patch: {
        enabled: true,
        connection: {
          mode: "external",
          wsHost: "127.0.0.1",
          wsPort: 5225,
        },
      },
    });
  },
  validateInput: ({ input }) => {
    const setupInput = input as SimplexSetupInput;
    const cliPath = setupInput.cliPath?.trim();
    if (cliPath) {
      return "SimpleX CLI path is not configured in OpenClaw. Start simplex-chat separately with its WebSocket API enabled.";
    }
    const runtimeUrl = setupInput.url?.trim() || setupInput.httpUrl?.trim();
    if (runtimeUrl && !runtimeUrl.startsWith("ws://") && !runtimeUrl.startsWith("wss://")) {
      return "SimpleX runtime URL must be a ws:// or wss:// WebSocket URL.";
    }
    return null;
  },
};
