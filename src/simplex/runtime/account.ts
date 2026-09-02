import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import {
  assertSimplexAccountReady,
  resolveDefaultSimplexAccountId,
  resolveSimplexAccount,
} from "../../config/accounts.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexLogger } from "../../types/simplex.js";
import type { SimplexClient } from "./client.js";
import { parseSimplexNumericId } from "./commands.js";
import { withSimplexClient } from "./transport.js";

export function resolveRuntimeAccount(
  cfg: OpenClawConfig,
  rawAccountId?: string | null
): ResolvedSimplexAccount {
  const explicit = rawAccountId?.trim();
  const accountId = explicit || resolveDefaultSimplexAccountId(cfg);
  const account = resolveSimplexAccount({ cfg, accountId });
  assertSimplexAccountReady(account);
  return account;
}

export async function withActiveSimplexUser<T>(params: {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  run: (userId: number, client: SimplexClient) => Promise<T>;
}): Promise<T> {
  return await withSimplexClient({
    account: params.account,
    logger: params.logger,
    run: async (client) => {
      const user = (await client.getActiveUser()) as Record<string, unknown> | undefined;
      const rawUserId = user?.userId;
      const userId =
        typeof rawUserId === "number" || typeof rawUserId === "string"
          ? parseSimplexNumericId(rawUserId)
          : null;
      if (userId === null) {
        throw new Error(`SimpleX account "${params.account.accountId}" has no active user`);
      }
      return await params.run(userId, client);
    },
  });
}
