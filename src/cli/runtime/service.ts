import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RuntimeServiceManager = "systemd-user" | "launchd";

export type RuntimeServiceOptions = {
  manager?: RuntimeServiceManager;
  binary?: string;
  port?: string | number;
  deviceName?: string;
  stateDir?: string;
  start?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  force?: boolean;
};

export type RuntimeServicePlan = {
  manager: RuntimeServiceManager;
  servicePath: string;
  content: string;
  stateDirs: string[];
  commands: string[][];
  notes: string[];
};

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function commandToString(command: string[]): string {
  return command.map(shellQuote).join(" ");
}

function quoteSystemdExecArg(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function expandHome(value: string, homeDir = os.homedir()): string {
  if (value === "~") {
    return homeDir;
  }
  if (value.startsWith("~/")) {
    return path.join(homeDir, value.slice(2));
  }
  return value;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function detectRuntimeServiceManager(
  platform: NodeJS.Platform = process.platform
): RuntimeServiceManager | null {
  if (platform === "darwin") {
    return "launchd";
  }
  if (platform === "linux") {
    return "systemd-user";
  }
  return null;
}

export function buildRuntimeServicePlan(
  opts: RuntimeServiceOptions = {},
  env: { platform?: NodeJS.Platform; homeDir?: string } = {}
): RuntimeServicePlan {
  const homeDir = env.homeDir ?? os.homedir();
  const manager = opts.manager ?? detectRuntimeServiceManager(env.platform ?? process.platform);
  if (!manager || (manager !== "systemd-user" && manager !== "launchd")) {
    throw new Error("Could not detect a supported service manager. Use --manager explicitly.");
  }

  const port = String(opts.port ?? 5225);
  const binary = expandHome(
    opts.binary ??
      (manager === "launchd" ? "/usr/local/bin/simplex-chat" : "~/.local/bin/simplex-chat"),
    homeDir
  );
  const deviceName = opts.deviceName ?? "OpenClaw SimpleX";
  const stateDir = expandHome(
    opts.stateDir ?? path.join(homeDir, ".local/state/openclaw-simplex"),
    homeDir
  );
  const filesDir = path.join(stateDir, "files");
  const tmpDir = path.join(stateDir, "tmp");
  const stateDirs = [stateDir, filesDir, tmpDir];

  if (manager === "systemd-user") {
    const servicePath = path.join(homeDir, ".config/systemd/user/simplex-chat.service");
    const content = `[Unit]
Description=SimpleX Chat WebSocket Runtime for OpenClaw
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${[
      binary,
      "-p",
      port,
      "--device-name",
      deviceName,
      "--files-folder",
      filesDir,
      "--temp-folder",
      tmpDir,
      "--log-file",
      path.join(stateDir, "simplex-chat.log"),
    ]
      .map(quoteSystemdExecArg)
      .join(" ")}
Restart=on-failure
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=10

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${[path.join(homeDir, ".simplex"), stateDir].map(quoteSystemdExecArg).join(" ")}

[Install]
WantedBy=default.target
`;
    const commands = opts.start
      ? [
          ["systemctl", "--user", "daemon-reload"],
          ["systemctl", "--user", "enable", "--now", "simplex-chat.service"],
        ]
      : [["systemctl", "--user", "daemon-reload"]];
    return {
      manager,
      servicePath,
      content,
      stateDirs,
      commands,
      notes: [
        "The service binds simplex-chat to the default local WebSocket port.",
        "OpenClaw should use ws://127.0.0.1:5225 unless you change --port.",
      ],
    };
  }

  const servicePath = path.join(homeDir, "Library/LaunchAgents/ai.openclaw.simplex-chat.plist");
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>ai.openclaw.simplex-chat</string>
    <key>ProgramArguments</key>
    <array>
      <string>${escapeXml(binary)}</string>
      <string>-p</string>
      <string>${escapeXml(port)}</string>
      <string>--device-name</string>
      <string>${escapeXml(deviceName)}</string>
      <string>--files-folder</string>
      <string>${escapeXml(filesDir)}</string>
      <string>--temp-folder</string>
      <string>${escapeXml(tmpDir)}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${escapeXml(path.join(stateDir, "simplex-chat.out.log"))}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(path.join(stateDir, "simplex-chat.err.log"))}</string>
  </dict>
</plist>
`;
  const uid = typeof process.getuid === "function" ? String(process.getuid()) : "$(id -u)";
  const label = `gui/${uid}/ai.openclaw.simplex-chat`;
  const commands = opts.start
    ? [
        ["launchctl", "bootstrap", `gui/${uid}`, servicePath],
        ["launchctl", "kickstart", "-k", label],
      ]
    : [];
  return {
    manager,
    servicePath,
    content,
    stateDirs,
    commands,
    notes: [
      "The launch agent binds simplex-chat to the default local WebSocket port.",
      "OpenClaw should use ws://127.0.0.1:5225 unless you change --port.",
    ],
  };
}

function printRuntimeServicePlan(plan: RuntimeServicePlan, opts: RuntimeServiceOptions): void {
  console.log("OpenClaw SimpleX runtime service plan");
  console.log(`- manager: ${plan.manager}`);
  console.log(`- service file: ${plan.servicePath}`);
  console.log(`- write mode: ${opts.force ? "overwrite existing file" : "refuse if file exists"}`);
  console.log(`- start service: ${opts.start ? "yes" : "no"}`);
  for (const note of plan.notes) {
    console.log(`- ${note}`);
  }
  if (plan.commands.length > 0) {
    console.log("Commands to run:");
    for (const command of plan.commands) {
      console.log(`- ${commandToString(command)}`);
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function confirmPlan(opts: RuntimeServiceOptions): Promise<boolean> {
  if (opts.yes) {
    return true;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "Refusing to make service changes without an interactive terminal. Use --yes or --dry-run."
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Apply this service plan? Type 'yes' to continue: ");
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

export async function runRuntimeServiceInstallCli(opts: RuntimeServiceOptions): Promise<void> {
  const plan = buildRuntimeServicePlan(opts);
  printRuntimeServicePlan(plan, opts);

  if (opts.dryRun) {
    console.log("Dry run only. No files were written and no commands were run.");
    return;
  }

  if ((await fileExists(plan.servicePath)) && !opts.force) {
    throw new Error(`Service file already exists: ${plan.servicePath}. Use --force to overwrite.`);
  }

  const confirmed = await confirmPlan(opts);
  if (!confirmed) {
    console.log("Aborted. No changes were made.");
    return;
  }

  await mkdir(path.dirname(plan.servicePath), { recursive: true });
  for (const stateDir of plan.stateDirs) {
    await mkdir(stateDir, { recursive: true });
  }
  await writeFile(plan.servicePath, plan.content, { mode: 0o644 });
  console.log(`Wrote ${plan.servicePath}`);

  for (const command of plan.commands) {
    console.log(`Running: ${commandToString(command)}`);
    const executable = command[0];
    if (!executable) {
      throw new Error("Internal error: empty service command");
    }
    await execFileAsync(executable, command.slice(1));
  }
}
