export type SimplexInviteMode = "connect" | "address";

export const INVITE_COMMANDS: Record<SimplexInviteMode, string> = {
  connect: "/c",
  address: "/ad",
};

export function resolveInviteMode(value: unknown): SimplexInviteMode | null {
  if (value === "connect" || value === "address") {
    return value;
  }
  return null;
}
