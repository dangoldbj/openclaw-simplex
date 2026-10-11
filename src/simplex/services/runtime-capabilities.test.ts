import { beforeEach, describe, expect, it } from "vitest";
import { testSimplexAccount } from "../../test-support/simplex-account.js";
import { clearSimplexDirectoryProbeCache } from "./directory-probes.js";
import {
  collectSimplexCapabilityIssues,
  probeSimplexCommandSupport,
  probeSimplexRuntimeCapabilities,
  type SimplexCapabilityClient,
} from "./runtime-capabilities.js";

function client(overrides: Partial<SimplexCapabilityClient> = {}): SimplexCapabilityClient {
  return {
    getActiveUser: async () => ({ userId: 1 }),
    getAddress: async () => ({ link: null, response: {} }),
    listContacts: async () => [{}],
    listGroups: async () => [],
    listUsers: async () => [{}],
    runCommand: async () => ({}),
    ...overrides,
  };
}

describe("simplex runtime capability probes", () => {
  beforeEach(() => {
    clearSimplexDirectoryProbeCache();
  });

  it("reads the runtime version from the nested versionInfo that simplex-chat returns", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: testSimplexAccount(),
      client: client({
        runCommand: async (command) =>
          command === "/version"
            ? {
                type: "versionInfo",
                versionInfo: { version: "6.4.8.0" },
                chatMigrations: [],
              }
            : {},
      }),
    });

    expect(result.capabilities.runtimeVersion).toBe("6.4.8.0");
    expect(result.capabilities.version).toMatchObject({ state: "supported", value: "6.4.8.0" });
  });

  it("reports an unknown version when /version answers without one", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: testSimplexAccount(),
      client: client({ runCommand: async () => ({ type: "versionInfo", versionInfo: {} }) }),
    });

    expect(result.capabilities.runtimeVersion).toBeNull();
    expect(result.capabilities.version.state).toBe("unknown");
  });

  it("marks a supported command response", async () => {
    const result = await probeSimplexCommandSupport({
      client: client(),
      command: "/_probe",
    });

    expect(result).toMatchObject({
      state: "supported",
      command: "/_probe",
    });
  });

  it("marks an unsupported command response", async () => {
    const result = await probeSimplexCommandSupport({
      client: client({
        runCommand: async () => {
          throw new Error("unknown command: /_probe");
        },
      }),
      command: "/_probe",
    });

    expect(result).toMatchObject({
      state: "unsupported",
      command: "/_probe",
      error: "unknown command: /_probe",
    });
  });

  it("marks non-unsupported command failures as errors", async () => {
    const result = await probeSimplexCommandSupport({
      client: client({
        runCommand: async () => {
          throw new Error("websocket closed");
        },
      }),
      command: "/_probe",
    });

    expect(result).toMatchObject({
      state: "error",
      command: "/_probe",
      error: "websocket closed",
    });
  });

  it("reports missing active user ids without probing contact or group counts", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: testSimplexAccount(),
      client: client({
        getActiveUser: async () => ({}),
      }),
    });

    expect(result.capabilities.activeUser.state).toBe("unknown");
    expect(result.capabilities.contacts).toMatchObject({
      state: "unknown",
      count: null,
      error: "No active user id available.",
    });
    expect(result.capabilities.groups).toMatchObject({
      state: "unknown",
      count: null,
      error: "No active user id available.",
      detail: expect.stringContaining("Advisory SimpleX group directory probe"),
    });
  });

  it("treats empty SimpleX list responses as supported empty counts", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: testSimplexAccount(),
      client: client({
        listGroups: async () => {
          throw new Error("Failed reading: empty");
        },
      }),
    });

    expect(result.groups).toEqual([]);
    expect(result.capabilities.groups).toMatchObject({
      state: "supported",
      count: 0,
      detail: expect.stringContaining("Advisory SimpleX group directory probe"),
    });
  });

  it("warns when live replies are enabled but runtime probe says unsupported", async () => {
    const result = await probeSimplexRuntimeCapabilities({
      account: testSimplexAccount({
        config: {
          connection: { wsHost: "127.0.0.1", wsPort: 5225 },
          streaming: { nativeTransport: true },
        },
      }),
      client: client({
        runCommand: async () => {
          throw new Error("unknown command: /_send live=on");
        },
      }),
      probeCommands: {
        liveMessages: "/_send @probe live=on json []",
      },
    });

    const issues = collectSimplexCapabilityIssues({
      account: testSimplexAccount({
        config: {
          connection: { wsHost: "127.0.0.1", wsPort: 5225 },
          streaming: { nativeTransport: true },
        },
      }),
      capabilities: result.capabilities,
    });

    expect(result.capabilities.liveMessages.state).toBe("unsupported");
    expect(issues.join("\n")).toContain("live replies are enabled");
    expect(issues.join("\n")).toContain("unsupported");
  });
});
