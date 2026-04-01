import {
  AllowFromListSchema,
  BlockStreamingCoalesceSchema,
  buildCatchallMultiAccountChannelSchema,
  buildChannelConfigSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ToolPolicySchema,
} from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "zod";

const groupConfigSchema = z.object({
  requireMention: z.boolean().optional(),
  tools: ToolPolicySchema.optional(),
});

const SimplexConnectionSchema = z
  .object({
    mode: z.literal("external").optional(),
    wsUrl: z.string().url().optional(),
    wsHost: z.string().optional(),
    wsPort: z.number().int().positive().optional(),
    autoAcceptFiles: z.boolean().optional(),
    connectTimeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export const SimplexAccountConfigSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    markdown: MarkdownConfigSchema,
    mediaMaxMb: z.number().int().positive().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    allowFrom: AllowFromListSchema,
    blockStreaming: z.boolean().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    groupPolicy: GroupPolicySchema.optional(),
    groupAllowFrom: AllowFromListSchema,
    groups: z.object({}).catchall(groupConfigSchema).optional(),
    connection: SimplexConnectionSchema.optional(),
  })
  .strict();

export const SimplexConfigSchema = buildCatchallMultiAccountChannelSchema(SimplexAccountConfigSchema);

export type SimplexAccountConfig = z.infer<typeof SimplexAccountConfigSchema>;
export type SimplexConfig = z.infer<typeof SimplexConfigSchema>;

export const SimplexChannelConfigSchema = buildChannelConfigSchema(SimplexConfigSchema);
