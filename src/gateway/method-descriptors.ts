import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";

/**
 * The SDK does not export the descriptor type by name, so it is taken from the
 * plugin contract it belongs to. That keeps the scope union in step with the
 * host instead of restating it as string literals.
 */
export type SimplexGatewayMethodDescriptor = NonNullable<
  ChannelPlugin["gatewayMethodDescriptors"]
>[number];

export type SimplexGatewayMethodScope = NonNullable<SimplexGatewayMethodDescriptor["scope"]>;

/**
 * Single source of truth for the gateway surface: the plugin declares these to
 * the host, and `registerSimplexGatewayMethods` reads each handler's scope from
 * here rather than repeating it at the registration site, so the advertised
 * scope and the enforced scope cannot drift.
 */
const GATEWAY_METHODS = [
  {
    name: "simplex.invite.create",
    scope: "operator.write",
    description: "Create a one-time invite link or the account's address link",
  },
  {
    name: "simplex.invite.list",
    scope: "operator.read",
    description: "List the current invite and address link state",
  },
  {
    name: "simplex.invite.revoke",
    scope: "operator.admin",
    description: "Revoke the current address link",
  },
  {
    name: "simplex.runtime.status",
    scope: "operator.read",
    description: "Report connection, runtime version, and capability status for an account",
  },
  {
    name: "simplex.runtime.doctor",
    scope: "operator.read",
    description: "Run runtime diagnostics against the external simplex-chat runtime",
  },
  {
    name: "simplex.runtime.users",
    scope: "operator.read",
    description: "List the profiles known to the SimpleX runtime",
  },
  {
    name: "simplex.runtime.activeUser",
    scope: "operator.read",
    description: "Show the runtime's active user profile",
  },
  {
    name: "simplex.verification.show",
    scope: "operator.read",
    description: "Show contact verification metadata when the runtime supports it",
  },
  {
    name: "simplex.verification.check",
    scope: "operator.admin",
    description: "Check a contact's verification code against the runtime",
  },
  {
    name: "simplex.requests.list",
    scope: "operator.read",
    description: "List pending contact requests seen by the runtime",
  },
  {
    name: "simplex.requests.accept",
    scope: "operator.admin",
    description: "Accept a pending contact request",
  },
  {
    name: "simplex.requests.reject",
    scope: "operator.admin",
    description: "Reject a pending contact request",
  },
  {
    name: "simplex.groups.create",
    scope: "operator.admin",
    description: "Create a SimpleX group",
  },
  {
    name: "simplex.groups.link.create",
    scope: "operator.admin",
    description: "Create a group invite link",
  },
  {
    name: "simplex.groups.link.list",
    scope: "operator.read",
    description: "Show the current group invite link",
  },
  {
    name: "simplex.groups.link.revoke",
    scope: "operator.admin",
    description: "Revoke the current group invite link",
  },
  {
    name: "simplex.groups.member.block",
    scope: "operator.admin",
    description: "Block or remove a group member when the runtime supports it",
  },
  {
    name: "simplex.groups.member.deleteMessages",
    scope: "operator.admin",
    description: "Remove a member's group messages when the runtime supports it",
  },
  {
    name: "simplex.files.receive",
    scope: "operator.admin",
    description: "Receive a pending file transfer",
  },
  {
    name: "simplex.files.cancel",
    scope: "operator.admin",
    description: "Cancel a file transfer",
  },
  {
    name: "simplex.connect.plan",
    scope: "operator.read",
    description: "Inspect what connecting to a SimpleX link would do, without connecting",
  },
  {
    name: "simplex.connect",
    scope: "operator.admin",
    description: "Connect the active user to a contact, address, or group link",
  },
] as const satisfies readonly SimplexGatewayMethodDescriptor[];

export type SimplexGatewayMethodName = (typeof GATEWAY_METHODS)[number]["name"];

/** The host's contract takes a mutable array, so the const table is copied out. */
export const SIMPLEX_GATEWAY_METHOD_DESCRIPTORS: SimplexGatewayMethodDescriptor[] = [
  ...GATEWAY_METHODS,
];

export const SIMPLEX_GATEWAY_METHOD_NAMES: SimplexGatewayMethodName[] = GATEWAY_METHODS.map(
  (descriptor) => descriptor.name
);

const SCOPES = new Map<SimplexGatewayMethodName, SimplexGatewayMethodScope>(
  GATEWAY_METHODS.map((descriptor) => [descriptor.name, descriptor.scope])
);

export function resolveSimplexGatewayMethodScope(
  name: SimplexGatewayMethodName
): SimplexGatewayMethodScope {
  const scope = SCOPES.get(name);
  if (!scope) {
    throw new Error(`No scope declared for gateway method ${name}`);
  }
  return scope;
}
