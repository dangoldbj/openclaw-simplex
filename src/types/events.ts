export type SimplexChatItem = {
  chatInfo?: {
    type?: string;
    contact?: { contactId?: number; localDisplayName?: string; profile?: { displayName?: string } };
    groupInfo?: { groupId?: number; localDisplayName?: string };
  };
  chatItem?: {
    chatDir?: {
      type?: string;
      groupMember?: {
        memberId?: string;
        groupMemberId?: number;
        contactId?: number | string;
        localDisplayName?: string;
      };
    };
    meta?: { itemId?: number; itemTs?: string };
    content?: { type?: string; msgContent?: { type?: string; text?: string } };
    file?: {
      fileId?: number;
      fileName?: string;
      fileSize?: number;
      fileSource?: { filePath?: string };
    };
  };
};

export type SimplexChatContext = {
  chatType: "direct" | "group";
  chatId: number;
  chatLabel: string;
  senderId?: string;
  senderName?: string;
};
