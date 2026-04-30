import { describe, expect, it } from "vitest";
import { buildRuntimeServicePlan, detectRuntimeServiceManager } from "./service.js";

describe("simplex runtime service plan", () => {
  it("detects supported service managers from platform", () => {
    expect(detectRuntimeServiceManager("linux")).toBe("systemd-user");
    expect(detectRuntimeServiceManager("darwin")).toBe("launchd");
    expect(detectRuntimeServiceManager("win32")).toBeNull();
  });

  it("builds a systemd user service plan", () => {
    const plan = buildRuntimeServicePlan(
      {
        manager: "systemd-user",
        binary: "~/bin/simplex-chat",
        port: 6123,
        deviceName: "OpenClaw SimpleX Test",
        start: true,
      },
      { homeDir: "/home/alice", platform: "linux" }
    );

    expect(plan.manager).toBe("systemd-user");
    expect(plan.servicePath).toBe("/home/alice/.config/systemd/user/simplex-chat.service");
    expect(plan.stateDirs).toContain("/home/alice/.local/state/openclaw-simplex/files");
    expect(plan.content).toContain('"/home/alice/bin/simplex-chat"');
    expect(plan.content).toContain('"OpenClaw SimpleX Test"');
    expect(plan.commands).toEqual([
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "enable", "--now", "simplex-chat.service"],
    ]);
  });

  it("builds a launchd service plan", () => {
    const plan = buildRuntimeServicePlan(
      {
        manager: "launchd",
        binary: "/opt/simplex/simplex-chat",
        port: 5226,
      },
      { homeDir: "/Users/alice", platform: "darwin" }
    );

    expect(plan.manager).toBe("launchd");
    expect(plan.servicePath).toBe(
      "/Users/alice/Library/LaunchAgents/ai.openclaw.simplex-chat.plist"
    );
    expect(plan.content).toContain("<string>/opt/simplex/simplex-chat</string>");
    expect(plan.content).toContain("<string>5226</string>");
    expect(plan.commands).toEqual([]);
  });
});
