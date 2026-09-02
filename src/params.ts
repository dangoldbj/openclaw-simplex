import { readPositiveIntegerParam } from "openclaw/plugin-sdk/channel-actions";

/**
 * SimpleX protocol ids (contact, group, member, file) are positive integers.
 *
 * The SDK helper treats a missing value as `undefined` so it can back optional
 * params; every call site here needs the id, so absence is an error.
 */
/**
 * Trimmed string value, or `""` when the input is absent or not a string.
 *
 * Untrusted parameter bags reach this plugin from three directions — agent tool
 * calls, gateway methods, and the CLI — and every one of them was repeating this
 * coercion inline.
 */
export function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Trimmed string value, or `undefined` when absent, non-string, or empty. */
export function readOptionalString(value: unknown): string | undefined {
  return readTrimmedString(value) || undefined;
}

/**
 * Reads a required non-empty string from an operator/gateway parameter bag.
 *
 * Shares the `(params, key)` shape with the other readers here so boundary
 * validation reads the same way wherever it happens.
 */
export function readRequiredStringParam(
  params: Record<string, unknown> | undefined,
  key: string
): string {
  const value = readTrimmedString(params?.[key]);
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function readRequiredPositiveInteger(
  params: Record<string, unknown> | undefined,
  key: string
): number {
  const value = readPositiveIntegerParam(params ?? {}, key);
  if (value === undefined) {
    throw new Error(`${key} must be a positive integer`);
  }
  return value;
}
