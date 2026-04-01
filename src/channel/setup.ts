import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/core";
import type { ChannelSetupAdapter, ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";

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

function setSimplexAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
}): OpenClawConfig {
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        simplex: {
          ...params.cfg.channels?.simplex,
          ...params.patch,
        },
      },
    };
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      simplex: {
        ...params.cfg.channels?.simplex,
        accounts: {
          ...params.cfg.channels?.simplex?.accounts,
          [params.accountId]: {
            ...params.cfg.channels?.simplex?.accounts?.[params.accountId],
            ...params.patch,
          },
        },
      },
    },
  };
}

function setSimplexConnectionConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
}): OpenClawConfig {
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        simplex: {
          ...params.cfg.channels?.simplex,
          connection: {
            ...params.cfg.channels?.simplex?.connection,
            ...params.patch,
          },
        },
      },
    };
  }

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      simplex: {
        ...params.cfg.channels?.simplex,
        accounts: {
          ...params.cfg.channels?.simplex?.accounts,
          [params.accountId]: {
            ...params.cfg.channels?.simplex?.accounts?.[params.accountId],
            connection: {
              ...params.cfg.channels?.simplex?.accounts?.[params.accountId]?.connection,
              ...params.patch,
            },
          },
        },
      },
    },
  };
}

export const simplexSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: resolveSetupAccountId,
  applyAccountName: ({ cfg, accountId, name }) => {
    const trimmed = name?.trim();
    if (!trimmed) {
      return cfg;
    }
    return setSimplexAccountConfig({
      cfg,
      accountId,
      patch: { name: trimmed, enabled: true },
    });
  },
  applyAccountConfig: ({ cfg, accountId, input }) => {
    let next = setSimplexAccountConfig({
      cfg,
      accountId,
      patch: { enabled: true },
    });

    const wsUrl = input.url?.trim() || input.httpUrl?.trim();
    if (wsUrl) {
      next = setSimplexConnectionConfig({
        cfg: next,
        accountId,
        patch: { mode: "external", wsUrl },
      });
    }

    return next;
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
