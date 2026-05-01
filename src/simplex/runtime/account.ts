import { createRequire } from "node:module";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../../config/accounts.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexChatApi, SimplexLogger } from "../../types/simplex.js";
import { withSimplexApi } from "../runtime/transport.js";

const require = createRequire(import.meta.url);

export function resolveRuntimeAccount(
  cfg: OpenClawConfig,
  rawAccountId?: string | null
): ResolvedSimplexAccount {
  const explicit = rawAccountId?.trim();
  const accountId = explicit || resolveDefaultSimplexAccountId(cfg);
  const account = resolveSimplexAccount({ cfg, accountId });
  if (!account.enabled) {
    throw new Error(`SimpleX account "${accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${accountId}" is not configured`);
  }
  return account;
}

export async function withActiveSimplexUser<T>(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  run: (userId: number, api: SimplexChatApi) => Promise<T>;
}): Promise<T> {
  return await withSimplexApi({
    account: params.account,
    logger: params.logger,
    run: async (api) => {
      const user = await api.apiGetActiveUser();
      const userId = user?.userId;
      if (typeof userId !== "number") {
        throw new Error(`SimpleX account "${params.account.accountId}" has no active user`);
      }
      return await params.run(userId, api);
    },
  });
}

export function readSimplexPackageVersion(): string | null {
  try {
    const pkg = require("simplex-chat/package.json") as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}
