import type { ChannelConfigUiHint } from "openclaw/plugin-sdk/channel-core";

function withAccountScope(
  hints: Record<string, ChannelConfigUiHint>
): Record<string, ChannelConfigUiHint> {
  return Object.fromEntries(
    Object.entries(hints).flatMap(([key, hint]) => [
      [key, hint],
      [`accounts.*.${key}`, hint],
    ])
  );
}

const accountScopedUiHints = withAccountScope({
  name: {
    label: "Account Name",
    help: "Optional friendly label for this SimpleX runtime account.",
  },
  enabled: {
    label: "Enabled",
    help: "Disable an account without deleting its SimpleX configuration.",
  },
  mediaMaxMb: {
    label: "Max Media Size (MB)",
    help: "Optional media size cap for files sent through this SimpleX account.",
    advanced: true,
    tags: ["media"],
  },
  actions: {
    label: "Actions",
    help: "Optional per-account action toggles for SimpleX message features.",
    advanced: true,
  },
  "actions.reactions": {
    label: "Enable Reactions",
    help: "Allow the agent to add or remove emoji reactions through the SimpleX runtime.",
    advanced: true,
    tags: ["actions"],
  },
  "actions.polls": {
    label: "Enable Polls",
    help: "Allow the agent to send OpenClaw poll prompts into SimpleX chats.",
    advanced: true,
    tags: ["actions"],
  },
  reactionLevel: {
    label: "Reaction Level",
    help: 'Controls agent reaction behavior. Use "minimal" for restrained reactions, "extensive" for more expressive use, "ack" for non-agent acknowledgements only, and "off" to disable reactions entirely.',
    advanced: true,
    tags: ["actions"],
  },
  dmPolicy: {
    label: "DM Policy",
    help: 'Direct-message access policy. "pairing" is the safest default; "open" should stay paired with a deliberate allowFrom policy.',
    tags: ["security"],
  },
  dmHistoryLimit: {
    label: "DM History Limit",
    help: "Optional direct-message transcript window to retain for reply context.",
    advanced: true,
  },
  allowFrom: {
    label: "DM Allowlist",
    help: 'Allowed SimpleX senders for direct messages. Use ["*"] only when you intentionally want broad DM reachability.',
    tags: ["security"],
  },
  blockStreaming: {
    label: "Block Streaming Replies",
    help: "Send streaming replies in coalesced blocks instead of incremental partial chunks.",
    advanced: true,
  },
  blockStreamingCoalesce: {
    label: "Streaming Coalesce",
    help: "Tune how block-mode streaming batches partial output before it is emitted.",
    advanced: true,
  },
  "blockStreamingCoalesce.minChars": {
    label: "Min Coalesce Chars",
    help: "Minimum buffered characters before an intermediate block update is sent.",
    advanced: true,
  },
  "blockStreamingCoalesce.maxChars": {
    label: "Max Coalesce Chars",
    help: "Maximum buffered characters before a block update is forced.",
    advanced: true,
  },
  "blockStreamingCoalesce.idleMs": {
    label: "Coalesce Idle Delay (ms)",
    help: "Maximum idle delay before a partially buffered block reply is flushed.",
    advanced: true,
  },
  groupPolicy: {
    label: "Group Policy",
    help: 'Group-message access policy. Keep "allowlist" unless you intentionally want broader group reachability.',
    tags: ["security"],
  },
  groupAllowFrom: {
    label: "Group Allowlist",
    help: "Allowed SimpleX senders for groups when groupPolicy is allowlist.",
    tags: ["security"],
  },
  groups: {
    label: "Group Overrides",
    help: "Optional per-group overrides for mention and tool policy behavior.",
    advanced: true,
  },
  "groups.*.requireMention": {
    label: "Require Mention",
    help: "Require an explicit mention before the bot responds in that group.",
    advanced: true,
  },
  "groups.*.tools": {
    label: "Tool Policy",
    help: "Optional per-group tool policy override for this SimpleX group.",
    advanced: true,
  },
  connection: {
    label: "Connection",
    help: "Transport settings for the external simplex-chat WebSocket runtime.",
  },
  "connection.mode": {
    label: "Connection Mode",
    help: "SimpleX currently supports only the external runtime mode in this plugin.",
    advanced: true,
  },
  "connection.wsUrl": {
    label: "WebSocket URL",
    help: "WebSocket URL for the running simplex-chat API, for example ws://127.0.0.1:5225.",
    placeholder: "ws://127.0.0.1:5225",
    tags: ["transport"],
  },
  "connection.wsHost": {
    label: "WebSocket Host",
    help: "Host override used when wsUrl is not set explicitly.",
    placeholder: "127.0.0.1",
    advanced: true,
    tags: ["transport"],
  },
  "connection.wsPort": {
    label: "WebSocket Port",
    help: "Port override used when wsUrl is not set explicitly.",
    placeholder: "5225",
    advanced: true,
    tags: ["transport"],
  },
  "connection.autoAcceptFiles": {
    label: "Auto Accept Files",
    help: "Automatically accept incoming file transfers from the SimpleX runtime.",
    advanced: true,
    tags: ["media"],
  },
  "connection.connectTimeoutMs": {
    label: "Connect Timeout (ms)",
    help: "WebSocket connection timeout in milliseconds.",
    advanced: true,
    tags: ["transport"],
  },
});

export const simplexChannelConfigUiHints = {
  "": {
    label: "SimpleX",
    help: "Connect OpenClaw to a separately running simplex-chat WebSocket runtime. Reachability starts from SimpleX invite or address links, while OpenClaw still applies pairing, allowlists, and group policy.",
  },
  defaultAccount: {
    label: "Default Account",
    help: "Account id OpenClaw should use when a command does not specify a SimpleX account.",
  },
  accounts: {
    label: "Additional Accounts",
    help: "Named SimpleX account overrides keyed by account id.",
    advanced: true,
  },
  ...accountScopedUiHints,
} satisfies Record<string, ChannelConfigUiHint>;
