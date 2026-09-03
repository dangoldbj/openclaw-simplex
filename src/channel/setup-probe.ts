import { existsSync } from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import { hasMeaningfulSimplexConfig, listSimplexAccountIds } from "../config/accounts.js";
import { DEFAULT_SIMPLEX_FILES_FOLDER, SIMPLEX_CHANNEL_ID } from "../constants.js";
import { expandHome } from "../fs-paths.js";

/**
 * The runtime's own state directory (`~/.simplex`), which `simplex-chat` creates
 * on first run. Derived from the files folder so the two cannot drift.
 */
const SIMPLEX_HOME = path.dirname(expandHome(DEFAULT_SIMPLEX_FILES_FOLDER));

function isSimplexAlreadyConfigured(cfg: OpenClawConfig): boolean {
  return listSimplexAccountIds(cfg).some((accountId) =>
    hasMeaningfulSimplexConfig({ cfg, accountId })
  );
}

/**
 * Suggests the SimpleX channel during onboarding when a local `simplex-chat`
 * has clearly been run before.
 *
 * The probe is synchronous, so it cannot open a WebSocket; presence of the
 * runtime's state directory is the strongest signal available without one. It
 * stays silent once any account is configured, so it never nags.
 */
export function probeSimplexAutoEnable(ctx: {
  config: OpenClawConfig;
  env: NodeJS.ProcessEnv;
}): string | null {
  if (isSimplexAlreadyConfigured(ctx.config)) {
    return null;
  }
  if (!existsSync(SIMPLEX_HOME)) {
    return null;
  }
  return `A local SimpleX runtime was detected at ${SIMPLEX_HOME}. Run "openclaw channels add --channel ${SIMPLEX_CHANNEL_ID}" to connect it.`;
}
