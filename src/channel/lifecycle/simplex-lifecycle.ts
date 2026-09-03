import type { ChannelPlugin, OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { listSimplexAccountIds } from "../../config/accounts.js";
import { describeError } from "../../errors.js";
import { closeAllActiveSimplexClients } from "../../simplex/runtime/transport.js";
import { clearStoredSimplexContactRequests } from "../../simplex/state/contact-requests.js";
import { clearSimplexEventDedupeForAccount } from "../../simplex/state/event-dedupe.js";
import { clearStoredSimplexPairingRequests } from "../../simplex/state/pairing-requests.js";
import { reapStrandedOutboundFiles, resolveSimplexOutboundDir } from "../media/outbound-files.js";

/** Not exported by name from any plugin-sdk subpath, so taken from the contract. */
type SimplexLifecycleAdapter = NonNullable<ChannelPlugin["lifecycle"]>;

function collectOutboundDirs(cfg: OpenClawConfig): string[] {
  const dirs = new Set<string>();
  for (const accountId of listSimplexAccountIds(cfg)) {
    const dir = resolveSimplexOutboundDir({ cfg, accountId });
    if (dir) {
      dirs.add(dir);
    }
  }
  return [...dirs];
}

export const simplexLifecycle: SimplexLifecycleAdapter = {
  /**
   * The staged-file reaper is an in-process timer, so anything staged before a
   * crash or restart is never reclaimed. Startup is the only place that backlog
   * can be seen at all.
   */
  runStartupMaintenance: async ({ cfg, log }) => {
    for (const outboundDir of collectOutboundDirs(cfg)) {
      try {
        const removed = await reapStrandedOutboundFiles({ outboundDir });
        if (removed > 0) {
          log.info?.(`SimpleX reclaimed ${removed} stranded outbound file(s) from ${outboundDir}`);
        }
      } catch (error) {
        log.warn?.(
          `SimpleX could not sweep staged outbound files in ${outboundDir}: ${describeError(error)}`
        );
      }
    }
  },

  /**
   * Per-account state is keyed by account id, so it would otherwise outlive the
   * account and be inherited by a later account that reuses the same id. Both
   * stores carry TTLs, which is why this is a tidy-up rather than a correctness
   * fix today — it stops being optional once the stores become durable.
   */
  onAccountRemoved: async ({ accountId, runtime }) => {
    try {
      const [requests, pairing, dedupe] = await Promise.all([
        clearStoredSimplexContactRequests({ accountId }),
        clearStoredSimplexPairingRequests({ accountId }),
        clearSimplexEventDedupeForAccount(accountId),
      ]);
      if (requests > 0 || pairing > 0 || dedupe > 0) {
        runtime.log?.(
          `[${accountId}] SimpleX cleared ${requests} contact request(s), ${pairing} pairing request(s) and ${dedupe} dedupe marker(s)`
        );
      }
    } catch (error) {
      runtime.error?.(
        `[${accountId}] SimpleX could not clear per-account state: ${describeError(error)}`
      );
    }
  },
};

/**
 * Host-level teardown (`disable`, `reset`, `delete`, `restart`).
 *
 * Staged files this process still tracks are deliberately left alone: the
 * runtime reads them asynchronously after the send returns, so deleting on the
 * way out could truncate an upload in flight. Those are reclaimed by the next
 * `runStartupMaintenance` instead.
 */
export function buildSimplexRuntimeLifecycle(api: {
  config: OpenClawConfig;
  logger?: { info?: (message: string) => void; error?: (message: string) => void };
}): { id: string; description: string; cleanup: () => Promise<void> } {
  return {
    id: "simplex-runtime",
    description: "Close SimpleX runtime clients and reclaim aged staged media",
    cleanup: async () => {
      try {
        const closed = await closeAllActiveSimplexClients();
        if (closed > 0) {
          api.logger?.info?.(`simplex: closed ${closed} runtime client(s)`);
        }
        for (const outboundDir of collectOutboundDirs(api.config)) {
          await reapStrandedOutboundFiles({ outboundDir });
        }
      } catch (error) {
        api.logger?.error?.(`simplex: runtime cleanup failed: ${describeError(error)}`);
      }
    },
  };
}
