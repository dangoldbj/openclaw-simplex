export const SIMPLEX_PLUGIN_ID = "openclaw-simplex";
export const SIMPLEX_CHANNEL_ID = "openclaw-simplex";
export const LEGACY_SIMPLEX_PLUGIN_ID = "simplex";
export const LEGACY_SIMPLEX_CHANNEL_ID = "simplex";
export const SIMPLEX_PROVIDER_PREFIXES = [SIMPLEX_CHANNEL_ID, LEGACY_SIMPLEX_CHANNEL_ID] as const;

/**
 * Outbound text chunk limit. SimpleX silently drops JSON messages over ~15,610
 * bytes, so outbound splitting and live-draft chunking share this ceiling.
 */
export const SIMPLEX_TEXT_CHUNK_LIMIT = 4000;

/** Default runtime folders (simplex-chat `--files-folder` / `--temp-folder`). */
/** Loopback default for the external `simplex-chat` WebSocket runtime (`simplex-chat -p 5225`). */
export const DEFAULT_SIMPLEX_WS_HOST = "127.0.0.1";
export const DEFAULT_SIMPLEX_WS_PORT = 5225;

export const DEFAULT_SIMPLEX_FILES_FOLDER = "~/.simplex/files";
export const DEFAULT_SIMPLEX_TEMP_FOLDER = "~/.simplex/tmp";

export function stripSimplexProviderPrefix(value: string): string {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  for (const prefix of SIMPLEX_PROVIDER_PREFIXES) {
    const providerPrefix = `${prefix}:`;
    if (lower.startsWith(providerPrefix)) {
      return trimmed.slice(providerPrefix.length).trim();
    }
  }
  return trimmed;
}
