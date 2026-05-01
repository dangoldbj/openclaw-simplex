import os from "node:os";
import path from "node:path";

type SimplexDbPathPlatform = NodeJS.Platform;

export function resolveSimplexCliDefaultDbPrefix(
  params: { platform?: SimplexDbPathPlatform; env?: NodeJS.ProcessEnv } = {}
): string {
  const platform = params.platform ?? process.platform;
  const env = params.env ?? process.env;
  if (platform === "win32") {
    return path.join(resolveWindowsAppData(env), "simplex", "simplex_v1");
  }
  return "~/.simplex/simplex_v1";
}

export function resolveSimplexDbFilePrefix(value: string): string {
  const expanded = expandHome(value);
  if (process.platform === "win32") {
    return path.resolve(expandWindowsEnvPrefix(expanded, process.env));
  }
  return path.resolve(expanded);
}

function resolveWindowsAppData(env: NodeJS.ProcessEnv): string {
  return env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function expandWindowsEnvPrefix(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/^%([^%]+)%[/\\]?/, (_match, rawName: string) => {
    const name = rawName.toUpperCase();
    const resolved = env[name] ?? env[rawName];
    return resolved ? `${resolved}${path.sep}` : "";
  });
}
