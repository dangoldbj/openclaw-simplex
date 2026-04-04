import { Type } from "@sinclair/typebox";
import type {
  ChannelMessageActionName,
  ChannelMessageToolSchemaContribution,
} from "openclaw/plugin-sdk/channel-contract";

export const SIMPLEX_SUPPORTED_ACTIONS = new Set<ChannelMessageActionName>([
  "upload-file",
  "react",
  "edit",
  "delete",
  "unsend",
  "renameGroup",
  "addParticipant",
  "removeParticipant",
  "leaveGroup",
]);

export const SIMPLEX_MESSAGE_TOOL_ACTIONS = [
  "send",
  "upload-file",
  "react",
  "edit",
  "delete",
  "unsend",
  "renameGroup",
  "addParticipant",
  "removeParticipant",
  "leaveGroup",
] as const satisfies readonly ChannelMessageActionName[];

export function buildSimplexMessageToolSchema(): ChannelMessageToolSchemaContribution {
  return {
    properties: {
      to: Type.Optional(
        Type.String({
          description: "SimpleX target chat reference. Accepts contact or group targets.",
        })
      ),
      chatRef: Type.Optional(
        Type.String({
          description: "Explicit SimpleX chat reference such as @contact or #group.",
        })
      ),
      chatId: Type.Optional(
        Type.String({
          description: "Alias for the target chat reference.",
        })
      ),
      chatType: Type.Optional(
        Type.Union([Type.Literal("direct"), Type.Literal("group")], {
          description: "Disambiguates the target when only an ID is provided.",
        })
      ),
      groupId: Type.Optional(
        Type.String({
          description: "SimpleX group identifier for group actions.",
        })
      ),
      messageId: Type.Optional(
        Type.Union([Type.String(), Type.Number()], {
          description: "Single message/chat item ID for react or edit actions.",
        })
      ),
      chatItemId: Type.Optional(
        Type.Union([Type.String(), Type.Number()], {
          description: "Alias for messageId.",
        })
      ),
      messageIds: Type.Optional(
        Type.Array(Type.Union([Type.String(), Type.Number()]), {
          description: "Multiple message/chat item IDs for delete or unsend actions.",
        })
      ),
      deleteMode: Type.Optional(
        Type.Union(
          [Type.Literal("broadcast"), Type.Literal("internal"), Type.Literal("internalMark")],
          { description: "SimpleX deletion mode." }
        )
      ),
      emoji: Type.Optional(
        Type.String({
          description: "Emoji shorthand for the react action.",
        })
      ),
      reaction: Type.Optional(
        Type.Object(
          {},
          {
            additionalProperties: true,
            description: "Raw SimpleX reaction payload for advanced react actions.",
          }
        )
      ),
      remove: Type.Optional(
        Type.Boolean({
          description: "When true, remove an existing reaction instead of adding one.",
        })
      ),
      text: Type.Optional(
        Type.String({
          description: "Replacement message text or upload caption.",
        })
      ),
      message: Type.Optional(
        Type.String({
          description: "Alias for text.",
        })
      ),
      caption: Type.Optional(
        Type.String({
          description: "Alias for text when uploading a file.",
        })
      ),
      mediaUrl: Type.Optional(
        Type.String({
          description: "File path or URL to upload via SimpleX.",
        })
      ),
      media: Type.Optional(
        Type.String({
          description: "Alias for mediaUrl.",
        })
      ),
      path: Type.Optional(
        Type.String({
          description: "Alias for mediaUrl when providing a local file path.",
        })
      ),
      filePath: Type.Optional(
        Type.String({
          description: "Alias for mediaUrl when providing a local file path.",
        })
      ),
      audioAsVoice: Type.Optional(
        Type.Boolean({
          description: "Send uploaded audio as a voice message when compatible.",
        })
      ),
      asVoice: Type.Optional(
        Type.Boolean({
          description: "Alias for audioAsVoice.",
        })
      ),
      displayName: Type.Optional(
        Type.String({
          description: "New SimpleX group display name.",
        })
      ),
      name: Type.Optional(
        Type.String({
          description: "Alias for displayName.",
        })
      ),
      title: Type.Optional(
        Type.String({
          description: "Alias for displayName.",
        })
      ),
      profile: Type.Optional(
        Type.String({
          description: "JSON-encoded SimpleX group profile for renameGroup.",
        })
      ),
      groupProfile: Type.Optional(
        Type.String({
          description: "Alias for profile.",
        })
      ),
      participant: Type.Optional(
        Type.String({
          description: "Participant identifier for addParticipant or removeParticipant.",
        })
      ),
      contactId: Type.Optional(
        Type.String({
          description: "Alias for participant when adding a group member.",
        })
      ),
      memberId: Type.Optional(
        Type.String({
          description: "Alias for participant when removing a group member.",
        })
      ),
    },
  };
}
