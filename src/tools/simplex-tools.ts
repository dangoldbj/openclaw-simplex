import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { resolveDefaultSimplexAccountId, resolveSimplexAccount } from "../config/accounts.js";
import {
  type SimplexInviteMode,
  INVITE_COMMANDS,
  resolveInviteMode,
} from "../simplex/simplex-invite.js";
import {
  extractSimplexLink,
  extractSimplexLinks,
  extractSimplexPendingHints,
} from "../simplex/simplex-links.js";
import { sendSimplexCommand } from "../simplex/simplex-transport.js";
import { executeSimplexAction } from "../actions/actions.js";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
};

const destructiveToolNames = new Set([
  "simplex_invite_revoke",
  "simplex_group_remove_participant",
  "simplex_group_leave",
]);

function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

function resolveToolAccountId(
  api: OpenClawPluginApi,
  rawAccountId: unknown,
  defaultAccountId?: string | null
): string {
  const explicit = typeof rawAccountId === "string" ? rawAccountId.trim() : "";
  const fallback = defaultAccountId?.trim();
  return explicit || fallback || resolveDefaultSimplexAccountId(api.config);
}

const InviteToolSchema = Type.Object({
  accountId: Type.Optional(Type.String({ description: "SimpleX account id. Defaults to the active/default account." })),
  mode: Type.Optional(
    Type.Union([Type.Literal("connect"), Type.Literal("address")], {
      description: 'Invite mode. "connect" creates a one-time link, "address" returns the account address link.',
    })
  ),
});

const GroupParticipantToolSchema = Type.Object({
  accountId: Type.Optional(Type.String({ description: "SimpleX account id. Defaults to the active/default account." })),
  groupId: Type.Optional(Type.String({ description: "SimpleX group id." })),
  chatRef: Type.Optional(Type.String({ description: "SimpleX group chat ref such as #group." })),
  to: Type.Optional(Type.String({ description: "Alias for group target." })),
  participant: Type.Optional(Type.String({ description: "Participant identifier." })),
  contactId: Type.Optional(Type.String({ description: "Alias for participant when adding a member." })),
  memberId: Type.Optional(Type.String({ description: "Alias for participant when removing a member." })),
});

const LeaveGroupToolSchema = Type.Object({
  accountId: Type.Optional(Type.String({ description: "SimpleX account id. Defaults to the active/default account." })),
  groupId: Type.Optional(Type.String({ description: "SimpleX group id." })),
  chatRef: Type.Optional(Type.String({ description: "SimpleX group chat ref such as #group." })),
  to: Type.Optional(Type.String({ description: "Alias for group target." })),
});

async function runInviteCreateTool(params: {
  api: OpenClawPluginApi;
  accountId?: string | null;
  mode: SimplexInviteMode;
}): Promise<ToolResult> {
  const accountId = resolveToolAccountId(params.api, params.accountId, null);
  const account = resolveSimplexAccount({ cfg: params.api.config, accountId });
  if (!account.enabled) {
    throw new Error(`SimpleX account "${accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${accountId}" is not configured`);
  }
  const response = await sendSimplexCommand({
    account,
    command: INVITE_COMMANDS[params.mode],
    logger: params.api.logger,
  });
  return jsonResult({
    accountId,
    mode: params.mode,
    link: extractSimplexLink(response),
    response,
  });
}

async function runInviteListTool(params: {
  api: OpenClawPluginApi;
  accountId?: string | null;
}): Promise<ToolResult> {
  const accountId = resolveToolAccountId(params.api, params.accountId, null);
  const account = resolveSimplexAccount({ cfg: params.api.config, accountId });
  if (!account.enabled) {
    throw new Error(`SimpleX account "${accountId}" is disabled`);
  }
  if (!account.configured) {
    throw new Error(`SimpleX account "${accountId}" is not configured`);
  }
  const [addressResponse, contactsResponse] = await Promise.all([
    sendSimplexCommand({
      account,
      command: "/show_address",
      logger: params.api.logger,
    }),
    sendSimplexCommand({
      account,
      command: "/contacts",
      logger: params.api.logger,
    }),
  ]);
  return jsonResult({
    accountId,
    addressLink: extractSimplexLink(addressResponse),
    links: [
      ...new Set([...extractSimplexLinks(addressResponse), ...extractSimplexLinks(contactsResponse)]),
    ],
    pendingHints: extractSimplexPendingHints(contactsResponse),
    addressResponse,
    contactsResponse,
  });
}

function buildApprovalDescription(toolName: string, params: Record<string, unknown>): string {
  const accountId = typeof params.accountId === "string" ? params.accountId.trim() : "";
  const group =
    (typeof params.groupId === "string" ? params.groupId.trim() : "") ||
    (typeof params.chatRef === "string" ? params.chatRef.trim() : "") ||
    (typeof params.to === "string" ? params.to.trim() : "");
  const participant =
    (typeof params.participant === "string" ? params.participant.trim() : "") ||
    (typeof params.memberId === "string" ? params.memberId.trim() : "") ||
    (typeof params.contactId === "string" ? params.contactId.trim() : "");

  if (toolName === "simplex_invite_revoke") {
    return `Revoke the current SimpleX address/invite for account ${accountId || "default"}.`;
  }
  if (toolName === "simplex_group_remove_participant") {
    return `Remove participant ${participant || "unknown"} from group ${group || "unknown"} on account ${accountId || "default"}.`;
  }
  if (toolName === "simplex_group_leave") {
    return `Leave SimpleX group ${group || "unknown"} on account ${accountId || "default"}.`;
  }
  return "Approve destructive SimpleX operation.";
}

export function registerSimplexTools(api: OpenClawPluginApi): void {
  api.registerTool((ctx) => ({
    name: "simplex_invite_create",
    label: "SimpleX Invite Create",
    description: "Create a SimpleX one-time connect link or return the account address link.",
    parameters: InviteToolSchema,
    async execute(_toolCallId, rawParams) {
      const mode = resolveInviteMode(rawParams?.mode) ?? "connect";
      return await runInviteCreateTool({
        api,
        accountId: resolveToolAccountId(api, rawParams?.accountId, ctx.agentAccountId),
        mode,
      });
    },
  }), { name: "simplex_invite_create" });

  api.registerTool((ctx) => ({
    name: "simplex_invite_list",
    label: "SimpleX Invite List",
    description: "List the current SimpleX address link plus known invite/pending-contact hints.",
    parameters: Type.Object({
      accountId: Type.Optional(
        Type.String({ description: "SimpleX account id. Defaults to the active/default account." })
      ),
    }),
    async execute(_toolCallId, rawParams) {
      return await runInviteListTool({
        api,
        accountId: resolveToolAccountId(api, rawParams?.accountId, ctx.agentAccountId),
      });
    },
  }), { name: "simplex_invite_list" });

  api.registerTool((ctx) => ({
    name: "simplex_invite_revoke",
    label: "SimpleX Invite Revoke",
    description: "Revoke the current SimpleX address/invite link for an account.",
    parameters: Type.Object({
      accountId: Type.Optional(
        Type.String({ description: "SimpleX account id. Defaults to the active/default account." })
      ),
    }),
    async execute(_toolCallId, rawParams) {
      const accountId = resolveToolAccountId(api, rawParams?.accountId, ctx.agentAccountId);
      const account = resolveSimplexAccount({ cfg: api.config, accountId });
      if (!account.enabled) {
        throw new Error(`SimpleX account "${accountId}" is disabled`);
      }
      if (!account.configured) {
        throw new Error(`SimpleX account "${accountId}" is not configured`);
      }
      const response = await sendSimplexCommand({
        account,
        command: "/delete_address",
        logger: api.logger,
      });
      return jsonResult({ accountId, revoked: true, response });
    },
  }), { name: "simplex_invite_revoke" });

  api.registerTool((ctx) => ({
    name: "simplex_group_add_participant",
    label: "SimpleX Group Add Participant",
    description: "Add a participant to a SimpleX group.",
    parameters: GroupParticipantToolSchema,
    async execute(_toolCallId, rawParams) {
      return await executeSimplexAction({
        action: "addParticipant",
        cfg: api.config,
        accountId: resolveToolAccountId(api, rawParams?.accountId, ctx.agentAccountId),
        actionParams: rawParams as Record<string, unknown>,
      });
    },
  }), { name: "simplex_group_add_participant" });

  api.registerTool((ctx) => ({
    name: "simplex_group_remove_participant",
    label: "SimpleX Group Remove Participant",
    description: "Remove a participant from a SimpleX group.",
    parameters: GroupParticipantToolSchema,
    async execute(_toolCallId, rawParams) {
      return await executeSimplexAction({
        action: "removeParticipant",
        cfg: api.config,
        accountId: resolveToolAccountId(api, rawParams?.accountId, ctx.agentAccountId),
        actionParams: rawParams as Record<string, unknown>,
      });
    },
  }), { name: "simplex_group_remove_participant" });

  api.registerTool((ctx) => ({
    name: "simplex_group_leave",
    label: "SimpleX Group Leave",
    description: "Leave a SimpleX group.",
    parameters: LeaveGroupToolSchema,
    async execute(_toolCallId, rawParams) {
      return await executeSimplexAction({
        action: "leaveGroup",
        cfg: api.config,
        accountId: resolveToolAccountId(api, rawParams?.accountId, ctx.agentAccountId),
        actionParams: rawParams as Record<string, unknown>,
      });
    },
  }), { name: "simplex_group_leave" });
}

export function registerSimplexToolHooks(api: OpenClawPluginApi): void {
  api.on("before_tool_call", (event) => {
    if (!destructiveToolNames.has(event.toolName)) {
      return;
    }
    return {
      requireApproval: {
        title: "Approve SimpleX admin action",
        description: buildApprovalDescription(event.toolName, event.params),
        severity: "warning",
        timeoutBehavior: "deny",
      },
    };
  });
}
