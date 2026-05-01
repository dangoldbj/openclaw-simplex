import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import {
  parseSimplexApiChatRef,
  resolveSimplexChatItemId,
  toSimplexApiChatRef,
} from "../../simplex/simplex-api.js";
import { withSimplexApi } from "../../simplex/simplex-transport.js";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import type { SimplexApiComposedMessage, SimplexComposedMessage } from "../../types/simplex.js";
import { buildComposedMessages } from "../media/simplex-media.js";

async function sendComposedMessages(params: {
  account: ResolvedSimplexAccount;
  chatRef: string;
  composedMessages: SimplexComposedMessage[];
}): Promise<{ messageId?: string }> {
  if (params.composedMessages.length === 0) {
    return {};
  }
  const apiChatRef = parseSimplexApiChatRef(params.chatRef);
  if (!apiChatRef) {
    throw new Error(`SimpleX chat ref must be numeric for runtime API: ${params.chatRef}`);
  }
  const chatItems = await withSimplexApi({
    account: params.account,
    run: (api) =>
      api.apiSendMessages(
        toSimplexApiChatRef(apiChatRef),
        params.composedMessages as SimplexApiComposedMessage[]
      ),
  });
  return { messageId: resolveSimplexChatItemId(chatItems[0]) };
}

export async function buildAndSendSimplexMessages(params: {
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
    account: params.account,
    chatRef: params.chatRef,
    composedMessages,
  });
}
