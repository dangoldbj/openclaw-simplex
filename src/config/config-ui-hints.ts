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
  connection: {
    label: "WebSocket Runtime",
    help: "Connection settings for the external simplex-chat WebSocket runtime.",
    tags: ["transport"],
  },
  "connection.wsUrl": {
    label: "WebSocket URL",
    help: "WebSocket URL for the external simplex-chat runtime.",
    placeholder: "ws://127.0.0.1:5225",
    tags: ["transport"],
  },
  "connection.wsHost": {
    label: "WebSocket Host",
    help: "Host used to build the runtime WebSocket URL when wsUrl is omitted.",
    placeholder: "127.0.0.1",
    advanced: true,
  },
  "connection.wsPort": {
    label: "WebSocket Port",
    help: "Port used to build the runtime WebSocket URL when wsUrl is omitted.",
    placeholder: "5225",
    advanced: true,
  },
  "connection.allowUnsafeRemoteWs": {
    label: "Allow Unsafe Remote WS",
    help: "Allow plaintext ws:// connections to non-loopback hosts only when protected by a private network, firewall, or TLS proxy.",
    advanced: true,
    tags: ["transport", "security"],
  },
  "connection.autoAcceptFiles": {
    label: "Auto Accept Files",
    help: "Automatically accept incoming file transfers from the SimpleX runtime.",
    advanced: true,
    tags: ["media"],
  },
  "connection.connectTimeoutMs": {
    label: "Connect Timeout (ms)",
    help: "Runtime connection/start timeout in milliseconds.",
    advanced: true,
    tags: ["transport"],
  },
  "connection.commandTimeoutMs": {
    label: "Command Timeout (ms)",
    help: "Default timeout for SimpleX WebSocket commands.",
    advanced: true,
    tags: ["transport"],
  },
  "connection.directoryTimeoutMs": {
    label: "Directory Timeout (ms)",
    help: "Shorter timeout for advisory contact and group directory lookups.",
    advanced: true,
    tags: ["transport"],
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
  contextVisibility: {
    label: "Context Visibility",
    help: "Controls whether supplemental chat context is visible broadly or only for allowlisted senders.",
    advanced: true,
    tags: ["security"],
  },
  allowFrom: {
    label: "DM Allowlist",
    help: 'Allowed SimpleX senders for direct messages. Use ["*"] only when you intentionally want broad DM reachability.',
    tags: ["security"],
  },
  replyToMode: {
    label: "Reply Quoting",
    help: 'Which replies quote the message they answer: "first" (default) quotes only the first message of a reply, "all" quotes every message, "off" never quotes.',
    advanced: true,
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
  streaming: {
    label: "SimpleX Live Streaming",
    help: "Optional SimpleX-native live message transport. Disabled by default so intermediate assistant text is not exposed unless enabled.",
    advanced: true,
    tags: ["streaming"],
  },
  "streaming.nativeTransport": {
    label: "Native Live Transport",
    help: "Use SimpleX live messages for assistant text previews when the runtime supports them.",
    advanced: true,
    tags: ["streaming"],
  },
  "streaming.throttleMs": {
    label: "Live Update Throttle (ms)",
    help: "Minimum delay between SimpleX live message edits.",
    placeholder: "2000",
    advanced: true,
    tags: ["streaming"],
  },
  "streaming.minChars": {
    label: "Live Update Min Chars",
    help: "Minimum added characters before a live message update is sent.",
    placeholder: "24",
    advanced: true,
    tags: ["streaming"],
  },
  "streaming.wordBoundary": {
    label: "Live Word Boundary",
    help: "Prefer live updates at word boundaries.",
    advanced: true,
    tags: ["streaming"],
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
  messageTtlSeconds: {
    label: "Message TTL (seconds)",
    help: "Optional SimpleX message time-to-live applied to outbound sends for this account.",
    advanced: true,
    tags: ["transport"],
  },
  filePolicy: {
    label: "File Policy",
    help: "Controls file receive behavior and diagnostics for this SimpleX account.",
    advanced: true,
    tags: ["media"],
  },
  "filePolicy.autoAccept": {
    label: "Auto Accept Files",
    help: "Automatically accept incoming file transfers from the SimpleX runtime.",
    advanced: true,
    tags: ["media"],
  },
  "filePolicy.maxSizeMb": {
    label: "Max Received File Size (MB)",
    help: "Advertised receive-side file size policy for diagnostics and operators.",
    advanced: true,
    tags: ["media"],
  },
  experimentalChannels: {
    label: "Experimental Channels",
    help: "Enable capability-gated SimpleX channel-like targets only after runtime commands are verified.",
    advanced: true,
    tags: ["experimental"],
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
  draftChunk: {
    label: "Live Draft Chunking",
    help: "Optional OpenClaw-standard live-draft chunking. When set, it overrides streaming.minChars and streaming.wordBoundary.",
    advanced: true,
  },
  "draftChunk.minChars": {
    label: "Draft Min Characters",
    help: "Minimum characters before the live draft updates.",
    advanced: true,
  },
  "draftChunk.maxChars": {
    label: "Draft Max Characters",
    help: "Maximum characters shown in the live draft; the final reply is never truncated.",
    advanced: true,
  },
  "draftChunk.breakPreference": {
    label: "Draft Break Preference",
    help: "Where the live draft trims back to: paragraph, newline, or sentence.",
    advanced: true,
  },
  mentionPatterns: {
    label: "Mention Patterns",
    help: "Restrict where agent name patterns count as a mention. Use allowIn/denyIn with SimpleX group ids.",
    advanced: true,
  },
  "mentionPatterns.mode": {
    label: "Mention Pattern Mode",
    help: '"allow" limits pattern matching to allowIn conversations; "deny" disables it in denyIn conversations.',
    advanced: true,
  },
  "mentionPatterns.allowIn": {
    label: "Mention Patterns Allowed In",
    help: "SimpleX group ids where agent name patterns count as a mention.",
    advanced: true,
  },
  "mentionPatterns.denyIn": {
    label: "Mention Patterns Denied In",
    help: "SimpleX group ids where agent name patterns must not count as a mention.",
    advanced: true,
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
});

export const simplexChannelConfigUiHints = {
  "": {
    label: "SimpleX",
    help: "Connect OpenClaw to SimpleX through an external simplex-chat WebSocket runtime. Reachability starts from SimpleX invite or address links, while OpenClaw still applies pairing, allowlists, and group policy.",
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
