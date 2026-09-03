import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SIMPLEX_CHANNEL_ID } from "../../constants.js";
import { expandHome } from "../../fs-paths.js";
import type { SimplexAccountScope } from "../../types/config.js";

/**
 * Shared outbound directory support (external mode, containerized runtime).
 *
 * When the SimpleX runtime runs in a container, it has a filesystem separate
 * from OpenClaw's (whether or not OpenClaw is itself containerized), so they
 * exchange files through a shared volume rather than a shared filesystem. On
 * send, the path in `fileSource.filePath` is resolved by the *runtime*, so it
 * must be valid on the runtime's side.
 *
 * - `connection.outboundFolder` — a directory OpenClaw can write to. When set,
 *   outbound media is staged there before the send command is issued. OpenClaw
 *   owns this directory (it writes it), so it is created if missing — unlike the
 *   inbound files-folder, which the runtime owns and the plugin only reads.
 * - `connection.outboundFolderOnClient` — optional. When both sides mount the
 *   shared volume at the *same* path, leave it unset and the staged path is sent
 *   as-is (verbatim). When they mount it at *different* paths, set this to the
 *   directory as the runtime sees it; the plugin still stages into
 *   `outboundFolder` but rewrites the directory prefix to this before sending,
 *   so no verbatim path is required. Has no effect without `outboundFolder`.
 *
 * Staged files are tracked (keyed by the path sent to the runtime, mapped to the
 * actual on-disk path) and reclaimed by a per-file timer a short while after
 * staging. Cleanup is deliberately NOT done on the send path: the send command
 * only hands the path to the runtime, which reads and uploads the file
 * asynchronously afterward, so deleting on send-return can race that read. When
 * `outboundFolder` is unset this module is inert and the local path is passed
 * as-is. Native mode never sets it (the embedded core shares the gateway's
 * filesystem).
 */

/**
 * How long a staged outbound file is kept before the reaper deletes it. Must
 * comfortably exceed the time the runtime needs to read/encrypt the source for
 * upload after the send command returns; transfers are bounded by `mediaMaxMb`,
 * so a few minutes is ample.
 */
const STAGED_FILE_TTL_MS = 5 * 60_000;

type StagedFile = {
  onDisk: string;
  timeout: ReturnType<typeof setTimeout>;
};

// sent path (as it appears in fileSource.filePath) -> staged on-disk file + reaper
const STAGED_FILES = new Map<string, StagedFile>();

/**
 * Track a staged file and schedule its reclamation. Keyed by the path sent to
 * the runtime; the mapped on-disk path is what is deleted (the two differ when
 * `outboundFolderOnClient` translates the prefix). The timer is unref'd so it
 * never keeps the process alive.
 */
function registerStagedFile(sentPath: string, onDiskPath: string): void {
  const previous = STAGED_FILES.get(sentPath);
  if (previous) {
    clearTimeout(previous.timeout);
  }
  const timeout = setTimeout(() => {
    const current = STAGED_FILES.get(sentPath);
    if (!current) {
      return;
    }
    STAGED_FILES.delete(sentPath);
    void unlink(current.onDisk).catch(() => {
      // Best-effort: the file may already be gone.
    });
  }, STAGED_FILE_TTL_MS);
  timeout.unref?.();
  STAGED_FILES.set(sentPath, { onDisk: onDiskPath, timeout });
}

/**
 * The shared outbound directory OpenClaw writes to (`connection.outboundFolder`),
 * or undefined when the feature is disabled. Account config overrides channel.
 * `~` is expanded (this is an OpenClaw-local path).
 */
export function resolveSimplexOutboundDir(params: SimplexAccountScope): string | undefined {
  const channel = params.cfg.channels?.[SIMPLEX_CHANNEL_ID];
  const account = params.accountId ? channel?.accounts?.[params.accountId] : undefined;
  const configured =
    account?.connection?.outboundFolder?.trim() || channel?.connection?.outboundFolder?.trim();
  return configured ? expandHome(configured) : undefined;
}

/**
 * The outbound directory as the *runtime* sees it (`connection.outboundFolderOnClient`),
 * or undefined. Not `~`-expanded — it's a path on the runtime's filesystem, not
 * OpenClaw's. Only meaningful alongside `outboundFolder`.
 */
export function resolveSimplexOutboundClientDir(params: SimplexAccountScope): string | undefined {
  const channel = params.cfg.channels?.[SIMPLEX_CHANNEL_ID];
  const account = params.accountId ? channel?.accounts?.[params.accountId] : undefined;
  return (
    account?.connection?.outboundFolderOnClient?.trim() ||
    channel?.connection?.outboundFolderOnClient?.trim() ||
    undefined
  );
}

/**
 * Translate a path under `outboundDir` (where OpenClaw wrote it) to the path the
 * runtime sees under `clientDir`, preserving any sub-path. Returns the input
 * unchanged when `clientDir` is unset (verbatim / same-path deployments).
 */
export function toClientOutboundPath(
  onDiskPath: string,
  outboundDir: string,
  clientDir?: string
): string {
  if (!clientDir) {
    return onDiskPath;
  }
  return path.join(clientDir, path.relative(outboundDir, onDiskPath));
}

/**
 * Whether a local path is already inside the shared outbound dir (so its bytes
 * are already where the runtime can read them and no copy is needed).
 */
export function isSimplexReadablePath(filePath: string, outboundDir: string): boolean {
  const prefix = outboundDir.endsWith(path.sep) ? outboundDir : outboundDir + path.sep;
  return filePath.startsWith(prefix);
}

function stagedFileName(fileName?: string): string {
  const base = fileName ? path.basename(fileName) : "";
  return base ? `${randomUUID()}-${base}` : randomUUID();
}

const STAGED_FILE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(-|$)/i;

/**
 * Deletes staged files left behind by a previous process.
 *
 * The per-file reaper is an in-memory timer, so a crash or a restart between
 * staging and reclamation strands the file forever. `outboundFolder` is a shared
 * volume the operator also owns, so only files matching the staged UUID naming
 * and older than the TTL are removed — anything else in that directory is left
 * alone.
 */
export async function reapStrandedOutboundFiles(params: {
  outboundDir: string;
  now?: number;
}): Promise<number> {
  const cutoff = (params.now ?? Date.now()) - STAGED_FILE_TTL_MS;
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(params.outboundDir, { encoding: "utf8" });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (!STAGED_FILE_NAME.test(entry)) {
      continue;
    }
    const onDisk = path.join(params.outboundDir, entry);
    // A file this process staged is still tracked and still has a live timer,
    // so leaving it to that timer avoids deleting media mid-upload.
    if ([...STAGED_FILES.values()].some((staged) => staged.onDisk === onDisk)) {
      continue;
    }
    try {
      const info = await stat(onDisk);
      if (!info.isFile() || info.mtimeMs > cutoff) {
        continue;
      }
      await unlink(onDisk);
      removed += 1;
    } catch {
      // Best-effort: another process may have removed it first.
    }
  }
  return removed;
}

/** Write a media buffer into the shared outbound dir; returns the path to send. */
export async function stageOutboundBuffer(params: {
  outboundDir: string;
  clientDir?: string;
  buffer: Uint8Array;
  fileName?: string;
}): Promise<string> {
  const onDisk = path.join(params.outboundDir, stagedFileName(params.fileName));
  await mkdir(params.outboundDir, { recursive: true });
  await writeFile(onDisk, params.buffer);
  const sent = toClientOutboundPath(onDisk, params.outboundDir, params.clientDir);
  registerStagedFile(sent, onDisk);
  return sent;
}

/** Copy a local file into the shared outbound dir; returns the path to send. */
export async function stageOutboundLocalFile(params: {
  outboundDir: string;
  clientDir?: string;
  sourcePath: string;
}): Promise<string> {
  const onDisk = path.join(params.outboundDir, stagedFileName(params.sourcePath));
  await mkdir(params.outboundDir, { recursive: true });
  await copyFile(params.sourcePath, onDisk);
  const sent = toClientOutboundPath(onDisk, params.outboundDir, params.clientDir);
  registerStagedFile(sent, onDisk);
  return sent;
}
