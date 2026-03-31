const SIMPLEX_LINK_REGEX = /\b(simplex:\/\/[^\s"'<>]+|https?:\/\/[^\s"'<>]+)/gi;

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, out);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStrings(entry, out);
    }
  }
}

export function extractSimplexLink(resp: unknown): string | null {
  const strings: string[] = [];
  collectStrings(resp, strings);
  const matches: string[] = [];
  for (const str of strings) {
    for (const match of str.matchAll(SIMPLEX_LINK_REGEX)) {
      const raw = match[0];
      const cleaned = raw.replace(/[),.\]]+$/g, "");
      matches.push(cleaned);
    }
  }
  const preferred = matches.find((entry) => /simplex/i.test(entry));
  return preferred ?? matches[0] ?? null;
}

export function extractSimplexLinks(resp: unknown): string[] {
  const strings: string[] = [];
  collectStrings(resp, strings);
  const matches = new Set<string>();
  for (const str of strings) {
    for (const match of str.matchAll(SIMPLEX_LINK_REGEX)) {
      const raw = match[0];
      const cleaned = raw.replace(/[),.\]]+$/g, "");
      if (cleaned) {
        matches.add(cleaned);
      }
    }
  }
  return [...matches];
}

export function extractSimplexPendingHints(resp: unknown): string[] {
  const strings: string[] = [];
  collectStrings(resp, strings);
  const hints = new Set<string>();
  for (const value of strings) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const lowered = trimmed.toLowerCase();
    if (lowered.includes("request") || lowered.includes("pending")) {
      hints.add(trimmed);
    }
  }
  return [...hints];
}
