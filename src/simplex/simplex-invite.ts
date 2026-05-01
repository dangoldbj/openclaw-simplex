import type { SimplexInviteMode } from "../types/invite.js";

export function resolveInviteMode(value: unknown): SimplexInviteMode | null {
  if (value === "connect" || value === "address") {
    return value;
  }
  return null;
}
