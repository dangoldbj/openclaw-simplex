import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { ChannelSetupAdapter, ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";
import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
} from "openclaw/plugin-sdk/setup";

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
      channelKey: "openclaw-simplex",
      accountId,
      name,
    });
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const wsUrl = input.url?.trim() || input.httpUrl?.trim();
    return applySetupAccountConfigPatch({
      cfg,
      channelKey: "openclaw-simplex",
      accountId,
      patch: {
        enabled: true,
        ...(wsUrl
          ? {
              connection: {
                mode: "external",
                wsUrl,
              },
            }
          : {}),
      },
    });
  },
  validateInput: ({ input }) => {
    const cliPath = input.cliPath?.trim();
    if (cliPath) {
      return "SimpleX managed mode is no longer supported; run simplex-chat separately and provide a ws:// or wss:// URL instead.";
    }
    const wsUrl = input.url?.trim() || input.httpUrl?.trim();
    if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
      return "SimpleX external URL must start with ws:// or wss://";
    }
    return null;
  },
};
