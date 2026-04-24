export const SIMPLEX_PLUGIN_ID = "openclaw-simplex";
export const SIMPLEX_CHANNEL_ID = "openclaw-simplex";
export const LEGACY_SIMPLEX_PLUGIN_ID = "simplex";
export const LEGACY_SIMPLEX_CHANNEL_ID = "simplex";
export const SIMPLEX_PROVIDER_PREFIXES = [SIMPLEX_CHANNEL_ID, LEGACY_SIMPLEX_CHANNEL_ID] as const;

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

export function hasSimplexProviderPrefix(value: string): boolean {
  const lower = value.trim().toLowerCase();
  return SIMPLEX_PROVIDER_PREFIXES.some((prefix) => lower.startsWith(`${prefix}:`));
}
