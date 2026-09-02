import { stripSimplexProviderPrefix } from "../constants.js";

/**
 * Canonical SimpleX chat-reference normalization.
 *
 * SimpleX addresses three kinds of conversation, each with its own sigil:
 * `@contact`, `#group`, `!channel`. Operators, agents, and the runtime all write
 * these in several equivalent spellings (`group:ops`, `contact:alice`, a bare
 * name, or with a `simplex:` provider prefix), so every entry point has to fold
 * them into the same canonical form.
 *
 * This module is the single place that does it. It previously lived in four
 * modules with divergent behavior, which produced real defects: the action path
 * turned `!news` into `@!news`, and the contact path turned `#ops` into `@#ops`,
 * silently defeating a guard that tried to reject group ids.
 *
 * Deliberately dependency-free apart from the provider prefixes, so both the
 * low-level runtime and the higher-level channel code can use it without
 * crossing the layering boundary described in AGENTS.md.
 */

export type SimplexChatRefKind = "direct" | "group" | "channel";

const SIGIL_BY_KIND: Record<SimplexChatRefKind, string> = {
  direct: "@",
  group: "#",
  channel: "!",
};

const KIND_BY_SIGIL: Record<string, SimplexChatRefKind | undefined> = {
  "@": "direct",
  "#": "group",
  "!": "channel",
};

/** The single-character markers that already denote a canonical reference. */
export const SIMPLEX_REF_SIGILS: readonly string[] = ["@", "#", "!"];

/** Spelled-out prefixes accepted as equivalents of the sigils. */
const KIND_BY_WORD_PREFIX: ReadonlyArray<readonly [string, SimplexChatRefKind]> = [
  ["group:", "group"],
  ["channel:", "channel"],
  ["contact:", "direct"],
  ["user:", "direct"],
  ["member:", "direct"],
];

/**
 * Splits a reference into its kind and bare id, or `null` when unmarked.
 *
 * Exported so target parsing can reuse the same prefix table instead of
 * restating which spellings mean which kind.
 */
export function readMarkedSimplexRef(
  value: string
): { kind: SimplexChatRefKind; id: string } | null {
  const sigilKind = KIND_BY_SIGIL[value.slice(0, 1)];
  if (sigilKind) {
    return { kind: sigilKind, id: value.slice(1).trim() };
  }
  const lowered = value.toLowerCase();
  for (const [prefix, kind] of KIND_BY_WORD_PREFIX) {
    if (lowered.startsWith(prefix)) {
      return { kind, id: value.slice(prefix.length).trim() };
    }
  }
  return null;
}

function resolveFallbackKind(chatType?: string | null): SimplexChatRefKind {
  if (chatType === "group" || chatType === "channel") {
    return chatType;
  }
  return "direct";
}

/**
 * Normalizes any accepted spelling to its canonical sigil form.
 *
 * An explicit marker in `raw` always wins; `chatType` only decides the sigil for
 * an unmarked id, and defaults to a direct contact.
 */
export function normalizeSimplexChatRef(raw: string, chatType?: string | null): string {
  const withoutPrefix = stripSimplexProviderPrefix(raw);
  if (!withoutPrefix) {
    return withoutPrefix;
  }

  const marked = readMarkedSimplexRef(withoutPrefix);
  if (marked) {
    // A marker with no id behind it is not a usable reference; returning the
    // original keeps the caller's error reporting meaningful.
    return marked.id ? `${SIGIL_BY_KIND[marked.kind]}${marked.id}` : withoutPrefix;
  }

  return `${SIGIL_BY_KIND[resolveFallbackKind(chatType)]}${withoutPrefix}`;
}

export function normalizeSimplexGroupRef(raw: string): string {
  return normalizeSimplexChatRef(raw, "group");
}

export function normalizeSimplexChannelRef(raw: string): string {
  return normalizeSimplexChatRef(raw, "channel");
}

/**
 * Normalizes a reference expected to name a contact.
 *
 * An explicitly marked group or channel is returned in its own canonical form
 * rather than being forced into a contact ref, so callers can detect and reject
 * it. Prefixing a group id with `@` used to hide exactly that case.
 */
export function normalizeSimplexContactRef(raw: string): string {
  return normalizeSimplexChatRef(raw, "direct");
}

/** Reports the kind a canonical reference denotes. */
export function readSimplexChatRefKind(ref: string): SimplexChatRefKind | null {
  return KIND_BY_SIGIL[ref.slice(0, 1)] ?? null;
}
