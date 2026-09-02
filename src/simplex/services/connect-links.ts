import type { SimplexAccountScope } from "../../types/config.js";
import { resolveRuntimeAccount, withActiveSimplexUser } from "../runtime/account.js";

export async function planSimplexConnectionLink(
  params: SimplexAccountScope & {
    link: string;
  }
): Promise<{ accountId: string; plan: unknown; preparedLink: unknown }> {
  const link = params.link.trim();
  if (!link) {
    throw new Error("link is required");
  }
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const plan = await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.planConnect(link),
  });
  return { accountId: account.accountId, plan, preparedLink: null };
}

export async function connectSimplexLink(
  params: SimplexAccountScope & {
    link: string;
  }
): Promise<{ accountId: string; connected: boolean; result: unknown }> {
  const link = params.link.trim();
  if (!link) {
    throw new Error("link is required");
  }
  const account = resolveRuntimeAccount(params.cfg, params.accountId);
  const result = await withActiveSimplexUser({
    account,
    run: (_userId, client) => client.connectLink(link),
  });
  return { accountId: account.accountId, connected: true, result };
}
