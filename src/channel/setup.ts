import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { ChannelSetupAdapter, ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";
import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
} from "openclaw/plugin-sdk/setup";
import { SIMPLEX_CHANNEL_ID } from "../constants.js";

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
      },
    });
  },
  validateInput: ({ input }) => {
    const cliPath = input.cliPath?.trim();
    if (cliPath) {
      return "SimpleX CLI path is no longer needed. This plugin uses the official Node runtime.";
    }
    const runtimeUrl = input.url?.trim() || input.httpUrl?.trim();
    if (runtimeUrl) {
      return "SimpleX runtime URLs are no longer supported. This plugin uses the official Node runtime.";
    }
    return null;
  },
};
