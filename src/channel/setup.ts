import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { defineChannelSetupContract } from "openclaw/plugin-sdk/channel-setup";
import {
  applyAccountNameToChannelSection,
  applySetupAccountConfigPatch,
} from "openclaw/plugin-sdk/setup";
import {
  DEFAULT_SIMPLEX_WS_HOST,
  DEFAULT_SIMPLEX_WS_PORT,
  SIMPLEX_CHANNEL_ID,
} from "../constants.js";
import { describeSimplexWsEndpointSecurity } from "../simplex/runtime/security.js";

/**
 * Setup fields for the external runtime.
 *
 * The whole premise of this channel is a separately-run `simplex-chat`, so
 * "where is your runtime?" is the first question setup has to answer. Before
 * these existed, `channels add` wrote a hardcoded loopback endpoint and any
 * other deployment had to hand-edit `openclaw.json`.
 *
 * A field's key must equal the camelCased long flag, which the host asserts at
 * registration. `package.json` mirrors this map under `openclaw.channel.setup`,
 * because the CLI reads setup fields from package metadata before the plugin
 * runtime loads; `setup.test.ts` fails on drift between the two.
 */
export const SIMPLEX_SETUP_FIELDS = {
  wsUrl: {
    kind: "string",
    cli: {
      flags: "--ws-url <url>",
      description: "SimpleX runtime WebSocket URL (ws:// or wss://)",
    },
  },
  wsHost: {
    kind: "string",
    cli: {
      flags: "--ws-host <host>",
      description: `SimpleX runtime host (default ${DEFAULT_SIMPLEX_WS_HOST})`,
    },
  },
  wsPort: {
    kind: "integer",
    cli: {
      flags: "--ws-port <port>",
      description: `SimpleX runtime WebSocket port (default ${DEFAULT_SIMPLEX_WS_PORT})`,
    },
  },
  outboundFolder: {
    kind: "string",
    cli: {
      flags: "--outbound-folder <path>",
      description: "Directory shared with the runtime for staging outbound media",
    },
  },
  allowUnsafeRemoteWs: {
    kind: "boolean",
    cli: {
      flags: "--allow-unsafe-remote-ws",
      description:
        "Allow plaintext ws:// to a non-loopback runtime (private network or TLS proxy only)",
    },
  },
} as const;

type SimplexSetupInput = {
  name?: string;
  wsUrl?: string;
  wsHost?: string;
  wsPort?: number;
  outboundFolder?: string;
  allowUnsafeRemoteWs?: boolean;
};

function resolveSetupAccountId(params: {
  cfg: OpenClawConfig;
  accountId?: string;
  input?: SimplexSetupInput;
}): string {
  // `normalizeAccountId` maps a missing id to "default", so an unset
  // `--account` has to be detected before normalizing; otherwise the name
  // branch below is unreachable and `--name work` lands on "default".
  if (params.accountId?.trim()) {
    return normalizeAccountId(params.accountId);
  }
  const fromName = typeof params.input?.name === "string" ? params.input.name.trim() : "";
  return normalizeAccountId(fromName || DEFAULT_ACCOUNT_ID);
}

function buildConnectionPatch(input: SimplexSetupInput): Record<string, unknown> {
  const wsUrl = input.wsUrl?.trim();
  const outboundFolder = input.outboundFolder?.trim();
  return {
    mode: "external",
    // wsUrl and host/port are alternative spellings of the same endpoint, so
    // only one pair is written; `validateInput` rejects supplying both.
    ...(wsUrl
      ? { wsUrl }
      : {
          wsHost: input.wsHost?.trim() || DEFAULT_SIMPLEX_WS_HOST,
          wsPort: input.wsPort ?? DEFAULT_SIMPLEX_WS_PORT,
        }),
    ...(outboundFolder ? { outboundFolder } : {}),
    ...(input.allowUnsafeRemoteWs ? { allowUnsafeRemoteWs: true } : {}),
  };
}

function resolveSetupWsUrl(input: SimplexSetupInput): string {
  const wsUrl = input.wsUrl?.trim();
  if (wsUrl) {
    return wsUrl;
  }
  const host = input.wsHost?.trim() || DEFAULT_SIMPLEX_WS_HOST;
  return `ws://${host}:${input.wsPort ?? DEFAULT_SIMPLEX_WS_PORT}`;
}

/**
 * Explicitly annotated: the inferred contract type names an internal SDK chunk,
 * which is not portable in the emitted declarations.
 */
export const simplexSetupContract: ReturnType<typeof defineChannelSetupContract> =
  defineChannelSetupContract({
    fields: SIMPLEX_SETUP_FIELDS,
    adapter: {
      resolveAccountId: resolveSetupAccountId,
      applyAccountName: ({ cfg, accountId, name }) =>
        applyAccountNameToChannelSection({
          cfg,
          channelKey: SIMPLEX_CHANNEL_ID,
          accountId,
          name,
        }),
      applyAccountConfig: ({ cfg, accountId, input }) =>
        applySetupAccountConfigPatch({
          cfg,
          channelKey: SIMPLEX_CHANNEL_ID,
          accountId,
          patch: {
            enabled: true,
            connection: buildConnectionPatch(input),
          },
        }),
      validateInput: ({ input }) => {
        const wsUrl = input.wsUrl?.trim();
        if (wsUrl && !/^wss?:\/\//i.test(wsUrl)) {
          return "SimpleX runtime URL must be a ws:// or wss:// WebSocket URL.";
        }
        if (wsUrl && (input.wsHost?.trim() || input.wsPort !== undefined)) {
          return "Pass either --ws-url or --ws-host/--ws-port, not both.";
        }
        if (input.wsPort !== undefined && (input.wsPort < 1 || input.wsPort > 65535)) {
          return "SimpleX runtime port must be between 1 and 65535.";
        }
        // The same guard the client applies on connect. Running it here fails
        // setup with an actionable message instead of writing config that only
        // breaks later, and keeps setup unable to widen the security posture:
        // an unsafe endpoint still needs the explicit opt-in.
        const security = describeSimplexWsEndpointSecurity(resolveSetupWsUrl(input), {
          allowUnsafeRemoteWs: input.allowUnsafeRemoteWs,
        });
        if (security.blockingWarnings.length > 0) {
          return security.blockingWarnings.join(" ");
        }
        return null;
      },
    },
  });
