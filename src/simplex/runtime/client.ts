import type { ResolvedSimplexAccount, SimplexBotProfile } from "../../types/config.js";
import type {
  SimplexComposedMessage,
  SimplexDeleteMode,
  SimplexGroupMemberRole,
  SimplexGroupProfile,
  SimplexLogger,
  SimplexReaction,
  SimplexRuntimeEvent,
} from "../../types/simplex.js";
import {
  buildAcceptContactRequestCommand,
  buildAddGroupMemberCommand,
  buildBlockGroupMemberCommand,
  buildCancelFileCommand,
  buildCheckContactVerificationCommand,
  buildConnectCommand,
  buildConnectPlanCommand,
  buildCreateGroupCommand,
  buildCreateGroupLinkCommand,
  buildDeleteChatItemCommand,
  buildDeleteGroupLinkCommand,
  buildDeleteGroupMemberMessagesCommand,
  buildLeaveGroupCommand,
  buildListContactsCommand,
  buildListGroupMembersCommand,
  buildListGroupsCommand,
  buildListUsersCommand,
  buildReactionCommand,
  buildReceiveFileCommand,
  buildRejectContactRequestCommand,
  buildRemoveGroupMemberCommand,
  buildSendMessagesCommand,
  buildShowActiveUserCommand,
  buildShowContactVerificationCommand,
  buildShowGroupLinkCommand,
  buildUpdateChatItemCommand,
  buildUpdateGroupProfileCommand,
  INVITE_COMMANDS,
} from "./commands.js";
import { SimplexCoreClient } from "./core-client.js";
import { extractSimplexLink } from "./links.js";
import {
  readSimplexArrayField,
  readSimplexObjectField,
  type SimplexCommandResponsePayload,
  unwrapSimplexCommandResponse,
} from "./responses.js";
import { assertSimplexWsEndpointAllowed } from "./security.js";
import type { SimplexConnectionState, SimplexTransport } from "./transport-types.js";
import { SimplexWsClient } from "./ws-client.js";

type SimplexClientParams = {
  account: ResolvedSimplexAccount;
  logger?: SimplexLogger;
  /** Native mode only: resolves the bot profile to apply at connect time. */
  nativeProfileResolver?: () => Promise<SimplexBotProfile>;
};

type SimplexCommandOptions = {
  timeoutMs?: number;
};

export class SimplexClient {
  private readonly ws: SimplexTransport;

  constructor(params: SimplexClientParams) {
    if (params.account.mode === "native") {
      this.ws = new SimplexCoreClient({
        account: params.account,
        logger: params.logger,
        ...(params.nativeProfileResolver ? { profileResolver: params.nativeProfileResolver } : {}),
      });
    } else {
      assertSimplexWsEndpointAllowed({
        wsUrl: params.account.wsUrl,
        allowUnsafeRemoteWs: params.account.config.connection?.allowUnsafeRemoteWs,
      });
      this.ws = new SimplexWsClient({
        url: params.account.wsUrl,
        connectTimeoutMs: params.account.config.connection?.connectTimeoutMs,
        commandTimeoutMs: params.account.config.connection?.commandTimeoutMs,
        logger: params.logger,
      });
    }
  }

  onEvent(handler: (event: SimplexRuntimeEvent) => void): () => void {
    return this.ws.onEvent(handler);
  }

  onConnectionState(handler: (state: SimplexConnectionState) => void): () => void {
    return this.ws.onConnectionState(handler);
  }

  getConnectionState(): SimplexConnectionState {
    return this.ws.getConnectionState();
  }

  async connect(): Promise<void> {
    await this.ws.connect();
  }

  async close(): Promise<void> {
    await this.ws.close();
  }

  async runCommand(
    command: string,
    options: SimplexCommandOptions = {}
  ): Promise<SimplexCommandResponsePayload> {
    return unwrapSimplexCommandResponse(await this.ws.sendCommand(command, options.timeoutMs));
  }

  async sendMessages(params: {
    chatRef: string;
    composedMessages: SimplexComposedMessage[];
    liveMessage?: boolean;
    ttl?: number;
  }): Promise<unknown[]> {
    const payload = await this.runCommand(buildSendMessagesCommand(params));
    return readSimplexArrayField(payload, ["chatItems", "items"]);
  }

  async reactToMessage(params: {
    chatRef: string;
    messageId: number;
    add: boolean;
    reaction: SimplexReaction;
  }): Promise<unknown> {
    return await this.runCommand(
      buildReactionCommand({
        chatRef: params.chatRef,
        chatItemId: params.messageId,
        add: params.add,
        reaction: params.reaction,
      })
    );
  }

  async editMessage(params: {
    chatRef: string;
    messageId: number | string;
    updatedMessage: SimplexComposedMessage;
    liveMessage?: boolean;
  }): Promise<unknown> {
    return await this.runCommand(
      buildUpdateChatItemCommand({
        chatRef: params.chatRef,
        chatItemId: params.messageId,
        updatedMessage: params.updatedMessage,
        liveMessage: params.liveMessage,
      })
    );
  }

  async deleteMessages(params: {
    chatRef: string;
    messageIds: Array<number | string>;
    deleteMode?: SimplexDeleteMode;
  }): Promise<unknown> {
    return await this.runCommand(
      buildDeleteChatItemCommand({
        chatRef: params.chatRef,
        chatItemIds: params.messageIds,
        deleteMode: params.deleteMode,
      })
    );
  }

  async receiveFile(fileId: number): Promise<unknown> {
    return await this.runCommand(buildReceiveFileCommand({ fileId }));
  }

  async cancelFile(fileId: number | string): Promise<unknown> {
    return await this.runCommand(buildCancelFileCommand(fileId));
  }

  async createInviteLink(): Promise<{ link: string | null; response: unknown }> {
    const response = await this.runCommand(INVITE_COMMANDS.connect);
    return { link: extractSimplexLink(response), response };
  }

  async createAddress(): Promise<{ link: string | null; response: unknown }> {
    const response = await this.runCommand(INVITE_COMMANDS.address);
    return { link: extractSimplexLink(response), response };
  }

  async getAddress(): Promise<{ link: string | null; response: unknown }> {
    const response = await this.runCommand("/show_address");
    return { link: extractSimplexLink(response), response };
  }

  async deleteAddress(): Promise<unknown> {
    return await this.runCommand("/delete_address");
  }

  async getActiveUser(options: SimplexCommandOptions = {}): Promise<unknown> {
    const payload = await this.runCommand(buildShowActiveUserCommand(), options);
    return readSimplexObjectField(payload, ["user", "activeUser"]);
  }

  async listUsers(options: SimplexCommandOptions = {}): Promise<unknown[]> {
    const payload = await this.runCommand(buildListUsersCommand(), options);
    return readSimplexArrayField(payload, ["users"]);
  }

  async listContacts(
    userId: number | string,
    options: SimplexCommandOptions = {}
  ): Promise<unknown[]> {
    const payload = await this.runCommand(buildListContactsCommand(userId), options);
    return readSimplexArrayField(payload, ["contacts"]);
  }

  async listGroups(
    params: {
      userId: number | string;
      contactId?: number | string | null;
      search?: string | null;
    },
    options: SimplexCommandOptions = {}
  ): Promise<unknown[]> {
    const payload = await this.runCommand(buildListGroupsCommand(params), options);
    return readSimplexArrayField(payload, ["groups"]);
  }

  async listGroupMembers(
    params: {
      groupId: number | string;
      search?: string | null;
    },
    options: SimplexCommandOptions = {}
  ): Promise<unknown[]> {
    const payload = await this.runCommand(buildListGroupMembersCommand(params), options);
    return readSimplexArrayField(payload, ["members", "groupMembers"]);
  }

  async createGroup(profile: SimplexGroupProfile): Promise<unknown> {
    const payload = await this.runCommand(buildCreateGroupCommand(profile));
    return readSimplexObjectField(payload, ["group", "groupInfo"]);
  }

  async updateGroupProfile(params: {
    groupId: number | string;
    profile: Partial<SimplexGroupProfile>;
  }): Promise<unknown> {
    return await this.runCommand(buildUpdateGroupProfileCommand(params));
  }

  async addGroupMember(params: {
    groupId: number | string;
    contactId: number | string;
  }): Promise<unknown> {
    return await this.runCommand(buildAddGroupMemberCommand(params));
  }

  async removeGroupMember(params: {
    groupId: number | string;
    memberId: number | string;
  }): Promise<unknown> {
    return await this.runCommand(buildRemoveGroupMemberCommand(params));
  }

  async blockGroupMember(params: {
    groupId: number | string;
    memberId: number | string;
  }): Promise<unknown> {
    return await this.runCommand(buildBlockGroupMemberCommand(params));
  }

  async deleteGroupMemberMessages(params: {
    groupId: number | string;
    memberId: number | string;
    deleteMode?: SimplexDeleteMode;
  }): Promise<unknown> {
    return await this.runCommand(buildDeleteGroupMemberMessagesCommand(params));
  }

  async leaveGroup(groupId: number | string): Promise<unknown> {
    return await this.runCommand(buildLeaveGroupCommand(groupId));
  }

  async createGroupLink(params: {
    groupId: number | string;
    role: SimplexGroupMemberRole;
  }): Promise<{ link: string | null; response: unknown }> {
    const response = await this.runCommand(buildCreateGroupLinkCommand(params));
    return { link: extractSimplexLink(response), response };
  }

  async getGroupLink(
    groupId: number | string
  ): Promise<{ link: string | null; response: unknown }> {
    const response = await this.runCommand(buildShowGroupLinkCommand(groupId));
    return { link: extractSimplexLink(response), response };
  }

  async deleteGroupLink(groupId: number | string): Promise<unknown> {
    return await this.runCommand(buildDeleteGroupLinkCommand(groupId));
  }

  async acceptContactRequest(contactRequestId: number): Promise<unknown> {
    return await this.runCommand(buildAcceptContactRequestCommand(contactRequestId));
  }

  async rejectContactRequest(contactRequestId: number): Promise<unknown> {
    return await this.runCommand(buildRejectContactRequestCommand(contactRequestId));
  }

  async showContactVerification(contactId: number | string): Promise<unknown> {
    return await this.runCommand(buildShowContactVerificationCommand(contactId));
  }

  async checkContactVerification(params: {
    contactId: number | string;
    code?: string | null;
  }): Promise<unknown> {
    return await this.runCommand(buildCheckContactVerificationCommand(params));
  }

  async planConnect(link: string): Promise<unknown> {
    return await this.runCommand(buildConnectPlanCommand(link));
  }

  async connectLink(link: string): Promise<unknown> {
    return await this.runCommand(buildConnectCommand(link));
  }
}
