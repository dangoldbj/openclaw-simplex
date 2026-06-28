import type { ResolvedSimplexAccount, SimplexBotProfile } from "../types/config.js";
import { getSimplexRuntime } from "./runtime.js";

/**
 * SimpleX embeds the avatar in the profile "info" sent to contacts, which has a
 * strict size limit (the core rejects oversized profiles with "large info"). So
 * the avatar is always downscaled to a small JPEG thumbnail before use.
 */
const MAX_AVATAR_BYTES = 12 * 1024;
const AVATAR_STEPS: ReadonlyArray<readonly [maxSide: number, quality: number]> = [
  [192, 70],
  [128, 60],
  [96, 50],
];

type ProfileLogger = { warn?: (message: string) => void };

/** Load the raw bytes of an avatar reference (data URI, http(s) URL, or file path). */
async function loadImageBytes(value: string): Promise<Buffer | undefined> {
  if (value.toLowerCase().startsWith("data:")) {
    const comma = value.indexOf(",");
    if (comma === -1) return undefined;
    const isBase64 = /;base64/i.test(value.slice(0, comma));
    const data = value.slice(comma + 1);
    return isBase64 ? Buffer.from(data, "base64") : Buffer.from(decodeURIComponent(data));
  }
  const core = getSimplexRuntime();
  if (/^https?:\/\//i.test(value)) {
    const fetched = await core.channel.media.readRemoteMediaBuffer({
      url: value,
      maxBytes: 8 * 1024 * 1024,
      filePathHint: value,
    });
    return Buffer.from(fetched.buffer);
  }
  const { readFile } = await import("node:fs/promises");
  return await readFile(value);
}

/**
 * Resolve an avatar reference into a small base64 JPEG data URI suitable for a
 * SimpleX profile. Best-effort: returns undefined (and warns) on any failure so
 * profile setup never blocks — and, critically, never sends an oversized image
 * that would make the whole profile update fail.
 */
async function resolveAvatarImage(
  raw: string,
  logger?: ProfileLogger
): Promise<string | undefined> {
  const value = raw.trim();
  if (!value) return undefined;
  const core = getSimplexRuntime();

  let source: Buffer | undefined;
  try {
    source = await loadImageBytes(value);
  } catch (err) {
    logger?.warn?.(`SimpleX avatar could not be loaded (${value}): ${String(err)}`);
    return undefined;
  }
  if (!source || source.byteLength === 0) return undefined;

  // SimpleX renders avatars in a fixed square, so a non-square image is
  // stretched. We can only scale (no crop is exposed by the runtime), so warn
  // and recommend a square source instead of silently distorting it.
  try {
    const meta = await core.media.getImageMetadata(source);
    if (meta?.width && meta?.height) {
      const ratio = Math.max(meta.width, meta.height) / Math.min(meta.width, meta.height);
      if (ratio > 1.05) {
        logger?.warn?.(
          `SimpleX avatar is not square (${meta.width}x${meta.height}); SimpleX renders avatars square, so it will appear stretched. Use a square image.`
        );
      }
    }
  } catch {
    // metadata is advisory only
  }

  for (const [maxSide, quality] of AVATAR_STEPS) {
    try {
      const jpeg = Buffer.from(
        await core.media.resizeToJpeg({
          buffer: source,
          maxSide,
          quality,
          withoutEnlargement: true,
        })
      );
      if (jpeg.byteLength <= MAX_AVATAR_BYTES) {
        // SimpleX expects the "image/jpg" media type in the data URI; the
        // standard "image/jpeg" label is not rendered by SimpleX clients.
        return `data:image/jpg;base64,${jpeg.toString("base64")}`;
      }
    } catch (err) {
      logger?.warn?.(`SimpleX avatar could not be processed: ${String(err)}`);
      return undefined;
    }
  }
  logger?.warn?.("SimpleX avatar is too large even after downscaling; skipping image.");
  return undefined;
}

/**
 * Resolve the bot profile for a native account.
 *
 * A SimpleX account has exactly one identity (one database, one address, one
 * profile that every contact sees), so the profile is an account-level concern.
 * It is intentionally NOT derived from agent identity: multiple agents can share
 * one account via routing, and agent identity is per-conversation, so it cannot
 * be projected onto the single per-account profile. Set `connection.profile`
 * explicitly to give the account a specific face.
 *
 * Precedence:
 *   displayName: profile.displayName -> account name -> "OpenClaw"
 *   image:       profile.image (downscaled to a small JPEG) -> none
 *   peerType:    profile.peerType    -> "bot"
 */
export async function resolveSimplexBotProfile(params: {
  account: ResolvedSimplexAccount;
  logger?: ProfileLogger;
}): Promise<SimplexBotProfile> {
  const { account, logger } = params;
  const configured = account.profile;

  const displayName = configured?.displayName?.trim() || account.name?.trim() || "OpenClaw";
  const fullName = configured?.fullName ?? "";
  const peerType = configured?.peerType ?? "bot";

  let image: string | undefined;
  const rawImage = configured?.image?.trim();
  if (rawImage) {
    image = await resolveAvatarImage(rawImage, logger);
  }

  return { displayName, fullName, peerType, ...(image ? { image } : {}) };
}
