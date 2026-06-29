import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedSimplexAccount } from "../../types/config.js";
import { SimplexCoreClient } from "./core-client.js";

// Shared, hoisted mock state for the (optional) native package.
const h = vi.hoisted(() => {
  const calls: string[] = [];
  const chat = {
    started: false,
    handlers: [] as ((e: unknown) => void)[],
    user: undefined as
      | {
          userId: number;
          profile?: {
            displayName?: string;
            fullName?: string;
            image?: string;
            peerType?: "bot" | "human";
          };
        }
      | undefined,
    address: undefined as
      | { autoAccept?: boolean; autoReply?: unknown; businessAddress?: boolean }
      | undefined,
    onAny(handler: (e: unknown) => void) {
      this.handlers.push(handler);
    },
    async startChat() {
      calls.push("startChat");
      this.started = true;
    },
    async stopChat() {
      calls.push("stopChat");
    },
    async close() {
      calls.push("close");
    },
    async sendChatCmd(cmd: string) {
      calls.push(`cmd:${cmd}`);
      return { type: "cmdOk", echoed: cmd };
    },
    async apiGetActiveUser() {
      return this.user;
    },
    async apiCreateActiveUser(profile: Record<string, unknown>) {
      calls.push("createUser");
      this.user = { userId: 1, profile: { ...(profile as Record<string, never>) } };
      return this.user;
    },
    async apiUpdateProfile(_userId: number, profile: Record<string, unknown>) {
      calls.push("updateProfile");
      if (this.user) {
        this.user.profile = { ...(profile as Record<string, never>) };
      }
      return {};
    },
    async apiGetUserAddress() {
      return this.address;
    },
    async apiCreateUserAddress() {
      calls.push("createAddress");
      // Fresh addresses are not auto-accepting until settings are applied.
      this.address = { autoAccept: false };
    },
    async apiSetAddressSettings(
      _userId: number,
      settings: { autoAccept?: boolean; welcomeMessage?: unknown; businessAddress?: boolean }
    ) {
      calls.push("setAddress");
      this.address = {
        autoAccept: settings.autoAccept,
        autoReply: settings.welcomeMessage,
        businessAddress: settings.businessAddress,
      };
    },
  };
  return { calls, chat };
});

vi.mock("simplex-chat", () => ({
  api: {
    ChatApi: {
      init: vi.fn(async () => {
        h.calls.push("init");
        return h.chat;
      }),
    },
  },
  core: { MigrationConfirmation: { YesUp: "yesUp" } },
  util: {
    contactAddressStr: () => "https://smp.example/a#addr",
    botAddressSettings: (address: {
      autoAccept?: boolean;
      autoReply?: unknown;
      businessAddress?: boolean;
    }) => ({
      autoAccept: Boolean(address?.autoAccept),
      welcomeMessage: address?.autoReply,
      businessAddress: address?.businessAddress,
    }),
  },
}));

function nativeAccount(overrides: Partial<ResolvedSimplexAccount> = {}): ResolvedSimplexAccount {
  return {
    accountId: "default",
    enabled: true,
    configured: true,
    mode: "native",
    wsUrl: "ws://127.0.0.1:5225",
    wsHost: "127.0.0.1",
    wsPort: 5225,
    db: { filePrefix: "./test_bot" },
    config: {},
    ...overrides,
  } as ResolvedSimplexAccount;
}

describe("SimplexCoreClient", () => {
  beforeEach(() => {
    h.calls.length = 0;
    h.chat.started = false;
    h.chat.handlers.length = 0;
    h.chat.user = undefined;
    h.chat.address = undefined;
  });

  it("boots the core in the required order: init -> create user -> startChat -> create address", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    await client.connect();
    expect(h.calls).toEqual(["init", "createUser", "startChat", "createAddress", "setAddress"]);
  });

  it("reports connected state after connect", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    const states: boolean[] = [];
    client.onConnectionState((s) => states.push(s.connected));
    await client.connect();
    expect(client.getConnectionState().connected).toBe(true);
    expect(states.at(-1)).toBe(true);
  });

  it("wraps native responses in the { resp } envelope", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    await client.connect();
    const res = await client.sendCommand("/contacts");
    expect(res).toEqual({ resp: { type: "cmdOk", echoed: "/contacts" } });
  });

  it("fans core events out to subscribers", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    const received: unknown[] = [];
    client.onEvent((e) => received.push(e));
    await client.connect();
    h.chat.handlers[0]?.({ type: "newChatItems", chatItems: [] });
    h.chat.handlers[0]?.({ notAnEvent: true }); // ignored (no string type)
    expect(received).toEqual([{ type: "newChatItems", chatItems: [] }]);
  });

  it("does not re-create or re-configure when user, profile, and address already match", async () => {
    // Fallback desired profile (no resolver, no config) is displayName "OpenClaw",
    // and default address settings are autoAccept=true, businessAddress=false.
    h.chat.user = {
      userId: 1,
      profile: { displayName: "OpenClaw", fullName: "", peerType: "bot" },
    };
    h.chat.address = { autoAccept: true, businessAddress: false };
    const client = new SimplexCoreClient({ account: nativeAccount() });
    await client.connect();
    expect(h.calls).not.toContain("createUser");
    expect(h.calls).not.toContain("createAddress");
    expect(h.calls).not.toContain("updateProfile");
    expect(h.calls).not.toContain("setAddress");
    expect(h.calls).toContain("startChat");
  });

  it("applies address settings on a fresh address, then skips them once they match", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    await client.connect();
    // Fresh address (autoAccept=false) drifts from desired (autoAccept=true) -> set once.
    expect(h.calls).toContain("createAddress");
    expect(h.calls).toContain("setAddress");

    // Second connect on the now-configured address must not re-set.
    h.calls.length = 0;
    h.chat.started = false;
    await client.connect();
    expect(h.calls).not.toContain("setAddress");
  });

  it("applies the resolved profile (name, peerType, image) when creating the user", async () => {
    const client = new SimplexCoreClient({
      account: nativeAccount(),
      profileResolver: async () => ({
        displayName: "Custom Bot",
        fullName: "Custom",
        peerType: "human",
        image: "data:image/png;base64,AAAA",
      }),
    });
    await client.connect();
    expect(h.calls).toContain("createUser");
    expect(h.calls).not.toContain("updateProfile");
    expect(h.chat.user?.profile).toMatchObject({
      displayName: "Custom Bot",
      fullName: "Custom",
      peerType: "human",
      image: "data:image/png;base64,AAAA",
    });
  });

  it("updates the profile when it drifts from the resolved desired profile", async () => {
    h.chat.user = {
      userId: 1,
      profile: { displayName: "old name", fullName: "", peerType: "bot" },
    };
    h.chat.address = {};
    const client = new SimplexCoreClient({
      account: nativeAccount(),
      profileResolver: async () => ({ displayName: "new name", fullName: "", peerType: "bot" }),
    });
    await client.connect();
    expect(h.calls).not.toContain("createUser");
    expect(h.calls).toContain("updateProfile");
    expect(h.chat.user?.profile?.displayName).toBe("new name");
  });

  it("defaults peerType to bot when the resolver omits it via fallback", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    await client.connect();
    expect(h.chat.user?.profile?.peerType).toBe("bot");
  });

  it("throws when native mode has no db.filePrefix", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount({ db: undefined }) });
    await expect(client.connect()).rejects.toThrow(/no db\.filePrefix/);
  });

  it("sends /smp and /xftp (space-joined) after startChat when servers are configured", async () => {
    const client = new SimplexCoreClient({
      account: nativeAccount({
        servers: {
          smp: ["smp://abc@s1.example", "smp://def@s2.example"],
          xftp: ["xftp://ghi@x1.example"],
        },
      }),
    });
    await client.connect();
    const startIdx = h.calls.indexOf("startChat");
    const smpIdx = h.calls.indexOf("cmd:/smp smp://abc@s1.example smp://def@s2.example");
    const xftpIdx = h.calls.indexOf("cmd:/xftp xftp://ghi@x1.example");
    expect(smpIdx).toBeGreaterThan(startIdx);
    expect(xftpIdx).toBeGreaterThan(startIdx);
  });

  it("does not send server commands when servers are not configured", async () => {
    const client = new SimplexCoreClient({ account: nativeAccount() });
    await client.connect();
    expect(h.calls.some((c) => c.startsWith("cmd:/smp"))).toBe(false);
    expect(h.calls.some((c) => c.startsWith("cmd:/xftp"))).toBe(false);
  });

  it("fails startup (does not fall back to defaults) when the core rejects a custom server command", async () => {
    const original = h.chat.sendChatCmd;
    h.chat.sendChatCmd = async (cmd: string) => {
      h.calls.push(`cmd:${cmd}`);
      const err = new Error("Chat command error (see chatError property)") as Error & {
        chatError?: unknown;
      };
      err.chatError = { type: "error", errorType: { type: "commandError" } };
      throw err;
    };
    try {
      const client = new SimplexCoreClient({
        account: nativeAccount({ servers: { smp: ["smp://abc@s1.example"] } }),
      });
      await expect(client.connect()).rejects.toThrow(/custom SMP server configuration failed/);
      expect(client.getConnectionState().connected).toBe(false);
    } finally {
      h.chat.sendChatCmd = original;
    }
  });
});
