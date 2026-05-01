import type { OpenClawConfig } from "openclaw/plugin-sdk/channel-core";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SimplexChatApi } from "../../types/simplex.js";

const simplexApiMock = vi.hoisted(() => ({
  contacts: [] as unknown[],
  groups: [] as unknown[],
  members: [] as unknown[],
  reset() {
    this.contacts = [];
    this.groups = [];
    this.members = [];
  },
}));

vi.mock("../../simplex/runtime/transport.js", () => ({
  withSimplexApi: async <T>(params: { run: (api: SimplexChatApi) => Promise<T> }): Promise<T> => {
    const api = {
      apiGetActiveUser: vi.fn(async () => ({
        userId: 1,
        profile: { displayName: "OpenClaw SimpleX" },
      })),
      apiListContacts: vi.fn(async () => simplexApiMock.contacts),
      apiListGroups: vi.fn(async () => simplexApiMock.groups),
      apiListMembers: vi.fn(async () => simplexApiMock.members),
    } as unknown as SimplexChatApi;
    return await params.run(api);
  },
}));

import {
  listSimplexDirectoryGroups,
  listSimplexDirectoryPeers,
  listSimplexGroupMembers,
} from "./simplex-directory.js";

const cfg = {
  channels: {
    "openclaw-simplex": {
      dbFilePrefix: "/tmp/openclaw-simplex-directory-test",
    },
  },
} as OpenClawConfig;

const runtime = {
  error: vi.fn(),
} as unknown as RuntimeEnv;

describe("simplex directory mapping", () => {
  afterEach(() => {
    simplexApiMock.reset();
    vi.clearAllMocks();
  });

  it("maps nested contact payloads and applies query filtering", async () => {
    simplexApiMock.contacts = [
      {
        contact: {
          contactId: 7,
          profile: { displayName: "Alice" },
        },
      },
      {
        contact: {
          contactId: 8,
          localDisplayName: "Bob",
        },
      },
    ];

    await expect(listSimplexDirectoryPeers({ cfg, runtime, query: "ali" })).resolves.toEqual([
      expect.objectContaining({
        kind: "user",
        id: "7",
        name: "Alice",
      }),
    ]);
  });

  it("maps nested group payloads", async () => {
    simplexApiMock.groups = [
      {
        groupInfo: {
          groupId: 42,
          groupProfile: { displayName: "Ops" },
        },
      },
    ];

    await expect(listSimplexDirectoryGroups({ cfg, runtime })).resolves.toEqual([
      expect.objectContaining({
        kind: "group",
        id: "42",
        name: "Ops",
      }),
    ]);
  });

  it("maps group member payloads", async () => {
    simplexApiMock.members = [
      {
        groupMember: {
          groupMemberId: 101,
          profile: { displayName: "Carol" },
        },
      },
    ];

    await expect(
      listSimplexGroupMembers({ cfg, runtime, groupId: "42", limit: 1 })
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "user",
        id: "101",
        name: "Carol",
      }),
    ]);
  });
});
