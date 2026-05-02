import type { SimplexConnectionConfig } from "../types/config.js";

type SimplexChatModule = typeof import("simplex-chat");
type ChatApi = Awaited<ReturnType<SimplexChatModule["api"]["ChatApi"]["init"]>>;

export type SimplexChatApi = ChatApi;
export type SimplexChatEvent = NonNullable<Awaited<ReturnType<ChatApi["recvChatEvent"]>>>;
export type SimplexMigrationConfirmation = SimplexChatModule["core"]["MigrationConfirmation"];
export type SimplexMigrationConfirmationSetting = SimplexConnectionConfig["migrationConfirmation"];

export type SimplexApiChatRef = Parameters<SimplexChatApi["apiSendMessages"]>[0];
export type SimplexApiNumericChatRef = ["direct" | "group", number];
export type SimplexApiChatType = Parameters<SimplexChatApi["apiUpdateChatItem"]>[0];
export type SimplexApiComposedMessage = Parameters<SimplexChatApi["apiSendMessages"]>[1][number];
export type SimplexApiMsgContent = Parameters<SimplexChatApi["apiUpdateChatItem"]>[3];
export type SimplexApiDeleteMode = Parameters<SimplexChatApi["apiDeleteChatItems"]>[3];
export type SimplexApiReaction = Parameters<SimplexChatApi["apiChatItemReaction"]>[4];
export type SimplexApiGroupProfile = Parameters<SimplexChatApi["apiUpdateGroupProfile"]>[1];
export type SimplexApiGroupMemberRole = Parameters<SimplexChatApi["apiAddMember"]>[2];

export type SimplexChatType = "direct" | "group" | "local";
export type SimplexChatRef = {
  type: SimplexChatType;
  id: number | string;
  scope?: string | null;
};

export type SimplexMsgContent = SimplexApiMsgContent & { text: string };
export type SimplexComposedMessage = SimplexApiComposedMessage;

export type SimplexLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  debug?: (message: string) => void;
};
