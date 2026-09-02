import { readPositiveIntegerParam } from "openclaw/plugin-sdk/channel-actions";

/**
 * SimpleX protocol ids (contact, group, member, file) are positive integers.
 *
 * The SDK helper treats a missing value as `undefined` so it can back optional
 * params; every call site here needs the id, so absence is an error.
 */
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
  const raw = params?.[key];
  const value = typeof raw === "string" ? raw.trim() : "";
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
