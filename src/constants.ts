export const SIMPLEX_PLUGIN_ID = "openclaw-simplex";
export const SIMPLEX_CHANNEL_ID = "openclaw-simplex";
export const LEGACY_SIMPLEX_PLUGIN_ID = "simplex";
export const LEGACY_SIMPLEX_CHANNEL_ID = "simplex";
export const SIMPLEX_PROVIDER_PREFIXES = [SIMPLEX_CHANNEL_ID, LEGACY_SIMPLEX_CHANNEL_ID] as const;

/**
 * Outbound text chunk size, in characters, for the host chunker and live
 * drafts. It is a readability limit; the byte limit below is what `simplex-chat`
 * enforces, and composition splits further whenever a chunk would exceed it.
 */
export const SIMPLEX_TEXT_CHUNK_LIMIT = 4000;

/**
 * `simplex-chat` rejects a message with `largeMsg` when its JSON encoding,
 * quote included, exceeds this (`maxEncodedMsgLength` in `Protocol.hs`).
 * Compression runs after that check, so it does not raise the ceiling.
 */
export const SIMPLEX_MAX_ENCODED_MSG_BYTES = 15602;

/**
 * Room left for what wraps `msgContent` on the wire: chat version range, shared
 * message id, the quote's `msgRef`, ttl and live flags. Roughly 300 bytes in
 * practice; a file invitation is accounted for separately.
 */
export const SIMPLEX_MSG_ENVELOPE_RESERVE_BYTES = 512;

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
