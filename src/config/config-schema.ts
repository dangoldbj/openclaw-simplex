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

const SimplexNativeDbSchema = z
  .object({
    type: z.literal("sqlite").optional(),
    filePrefix: z.string().min(1),
    encryptionKey: z.string().optional(),
  })
  .strict();

const SimplexNativeProfileSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    fullName: z.string().optional(),
    image: z.string().optional(),
    peerType: z.enum(["bot", "human"]).optional(),
  })
  .strict();

const SimplexNativeAddressSettingsSchema = z
  .object({
    autoAccept: z.boolean().optional(),
    welcomeMessage: z.string().optional(),
    businessAddress: z.boolean().optional(),
  })
  .strict();

const SimplexNativeServersSchema = z
  .object({
    smp: z.array(z.string().min(1)).optional(),
    xftp: z.array(z.string().min(1)).optional(),
  })
  .strict();

const SimplexConnectionSchema = z
  .object({
    mode: z.enum(["external", "native"]).optional(),
    wsUrl: z.string().url().optional(),
    wsHost: z.string().optional(),
    wsPort: z.number().int().positive().optional(),
    allowUnsafeRemoteWs: z.boolean().optional(),
    autoAcceptFiles: z.boolean().optional(),
    connectTimeoutMs: z.number().int().positive().optional(),
    commandTimeoutMs: z.number().int().positive().optional(),
    directoryTimeoutMs: z.number().int().positive().optional(),
    // native mode (embedded simplex-chat core)
    db: SimplexNativeDbSchema.optional(),
    profile: SimplexNativeProfileSchema.optional(),
    addressSettings: SimplexNativeAddressSettingsSchema.optional(),
    servers: SimplexNativeServersSchema.optional(),
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
    messageTtlSeconds: z.number().int().positive().optional(),
    filePolicy: SimplexFilePolicySchema.optional(),
    experimentalChannels: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional(),
    groupAllowFrom: SimplexAllowFromListSchema,
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
