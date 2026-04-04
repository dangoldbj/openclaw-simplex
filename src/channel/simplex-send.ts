import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ResolvedSimplexAccount } from "../config/types.js";
import {
  buildSendMessagesCommand,
  type SimplexComposedMessage,
} from "../simplex/simplex-commands.js";
import { resolveSimplexCommandError } from "../simplex/simplex-errors.js";
import type { SimplexClientRegistry } from "./simplex-client-registry.js";
import { withSimplexRegistryClient } from "./simplex-client-registry.js";
import { normalizeSimplexMessageId } from "./simplex-common.js";
import { buildComposedMessages } from "./simplex-media.js";

export async function sendComposedMessages(params: {
  registry: SimplexClientRegistry;
  account: ResolvedSimplexAccount;
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
}): Promise<{ messageId?: string }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const cmd = buildSendMessagesCommand({
    chatRef: params.chatRef,
    composedMessages: params.composedMessages,
  });
  const response = await withSimplexRegistryClient(params.registry, params.account, (client) =>
    client.sendCommand(cmd)
  );
  const resp = response.resp as {
    type?: string;
    chatError?: { errorType?: { type?: string; message?: string } };
    chatItems?: Array<{ chatItem?: { meta?: { itemId?: unknown } } }>;
    itemId?: unknown;
    messageId?: unknown;
  };
  const commandError = resolveSimplexCommandError(resp);
  if (commandError) {
    throw new Error(commandError);
  }
  const messageId =
    normalizeSimplexMessageId(resp.chatItems?.[0]?.chatItem?.meta?.itemId) ??
    normalizeSimplexMessageId(resp.messageId) ??
    normalizeSimplexMessageId(resp.itemId);
  return { messageId };
}

export async function buildAndSendSimplexMessages(params: {
  registry: SimplexClientRegistry;
  cfg: OpenClawConfig;
  account: ResolvedSimplexAccount;
  chatRef: string;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  audioAsVoice?: boolean;
}): Promise<{ messageId?: string }> {
  const composedMessages = await buildComposedMessages({
    cfg: params.cfg,
    accountId: params.account.accountId,
    text: params.text,
    mediaUrl: params.mediaUrl,
    mediaUrls: params.mediaUrls,
    audioAsVoice: params.audioAsVoice,
  });
  return await sendComposedMessages({
    registry: params.registry,
    account: params.account,
    chatRef: params.chatRef,
    composedMessages,
  });
}
