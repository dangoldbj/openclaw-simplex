import {
  AllowFromListSchema,
  BlockStreamingCoalesceSchema,
  buildCatchallMultiAccountChannelSchema,
  buildChannelConfigSchema,
  ContextVisibilityModeSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  MentionPatternsPolicySchema,
  ReplyToModeSchema,
  ToolPolicySchema,
} from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "zod";
import { simplexChannelConfigUiHints } from "./config-ui-hints.js";

const SimplexAllowFromListSchema = AllowFromListSchema.pipe(z.array(z.string()).optional());

const groupConfigSchema = z.object({
  requireMention: z.boolean().optional(),
  tools: ToolPolicySchema.optional(),
});

const SimplexActionConfigSchema = z
  .object({
    reactions: z.boolean().optional(),
    polls: z.boolean().optional(),
  })
  .strict();

const SimplexReactionLevelSchema = z.enum(["off", "ack", "minimal", "extensive"]).optional();

const SimplexConnectionSchema = z
  .object({
    mode: z.literal("external").optional(),
    wsUrl: z.string().url().optional(),
    wsHost: z.string().optional(),
    wsPort: z.number().int().positive().optional(),
    allowUnsafeRemoteWs: z.boolean().optional(),
    autoAcceptFiles: z.boolean().optional(),
    filesFolder: z.string().min(1).optional(),
    outboundFolder: z.string().min(1).optional(),
    outboundFolderOnClient: z.string().min(1).optional(),
    connectTimeoutMs: z.number().int().positive().optional(),
    commandTimeoutMs: z.number().int().positive().optional(),
    directoryTimeoutMs: z.number().int().positive().optional(),
  })
  .strict();

const SimplexStreamingSchema = z
  .object({
    nativeTransport: z.boolean().optional(),
    throttleMs: z.number().int().positive().optional(),
    minChars: z.number().int().positive().optional(),
    wordBoundary: z.boolean().optional(),
  })
  .strict();

/**
 * OpenClaw's canonical live-draft chunking shape. Reading it through the SDK
 * keeps SimpleX aligned with host streaming conventions; when unset, the legacy
 * `streaming.minChars` / `streaming.wordBoundary` behavior is preserved.
 */
const SimplexDraftChunkSchema = z
  .object({
    minChars: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    breakPreference: z.enum(["paragraph", "newline", "sentence"]).optional(),
  })
  .strict();

const SimplexFilePolicySchema = z
  .object({
    autoAccept: z.boolean().optional(),
    maxSizeMb: z.number().int().positive().optional(),
  })
  .strict();

export const SimplexAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    mediaMaxMb: z.number().int().positive().optional(),
    actions: SimplexActionConfigSchema.optional(),
    reactionLevel: SimplexReactionLevelSchema,
    dmPolicy: DmPolicySchema.optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    contextVisibility: ContextVisibilityModeSchema.optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    allowFrom: SimplexAllowFromListSchema,
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    streaming: SimplexStreamingSchema.optional(),
    draftChunk: SimplexDraftChunkSchema.optional(),
    messageTtlSeconds: z.number().int().positive().optional(),
    replyToMode: ReplyToModeSchema.optional(),
    filePolicy: SimplexFilePolicySchema.optional(),
    experimentalChannels: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional(),
    groupAllowFrom: SimplexAllowFromListSchema,
    mentionPatterns: MentionPatternsPolicySchema.optional(),
    groups: z.object({}).catchall(groupConfigSchema).optional(),
    connection: SimplexConnectionSchema.optional(),
  })
  .strict();

export const SimplexConfigSchema = buildCatchallMultiAccountChannelSchema(
  SimplexAccountConfigSchema
);

export type SimplexAccountConfig = z.infer<typeof SimplexAccountConfigSchema>;
export type SimplexConfig = z.infer<typeof SimplexConfigSchema>;
export type SimplexChannelConfig = SimplexConfig & {
  accounts?: Record<string, SimplexAccountConfig | undefined>;
};
export const SIMPLEX_ACCOUNT_CONFIG_CLEAR_FIELDS = Object.keys(
  SimplexAccountConfigSchema.shape
) as Array<keyof SimplexAccountConfig>;

export const SimplexChannelConfigSchema: ReturnType<typeof buildChannelConfigSchema> =
  buildChannelConfigSchema(SimplexConfigSchema, {
    uiHints: simplexChannelConfigUiHints,
  });
