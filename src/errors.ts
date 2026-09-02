/**
 * Renders an unknown thrown value as a human-readable message.
 *
 * `catch` binds `unknown`, and nearly every boundary in this plugin needs the
 * same one-line coercion before logging it or putting it in a result. Keeping it
 * here stops that line from being rewritten — it had eight separate copies, and
 * one of them lived in a service module that unrelated code had to import from.
 */
export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
