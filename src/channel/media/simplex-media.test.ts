import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk/channel-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setSimplexRuntime } from "../runtime.js";
import { buildComposedMessages } from "./simplex-media.js";

const PHOTO_URL = "https://example.com/photo.jpg";

function installRuntime(media: Record<string, unknown>) {
  setSimplexRuntime({
    media: {
      mediaKindFromMime: () => "image",
      isVoiceCompatibleAudio: () => false,
    },
    channel: { media },
  } as object as PluginRuntime);
}

describe("buildComposedMessages with a remote media URL", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("saves the download straight into the media store", async () => {
    const saveRemoteMedia = vi.fn(async () => ({
      id: "photo---uuid.jpg",
      path: "/store/media/openclaw-simplex/photo---uuid.jpg",
      size: 9,
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    }));
    const readRemoteMediaBuffer = vi.fn();
    installRuntime({ saveRemoteMedia, readRemoteMediaBuffer });

    const [message] = await buildComposedMessages({ cfg: {}, mediaUrl: PHOTO_URL });

    expect(saveRemoteMedia).toHaveBeenCalledWith(
      expect.objectContaining({ url: PHOTO_URL, subdir: "openclaw-simplex" })
    );
    expect(readRemoteMediaBuffer).not.toHaveBeenCalled();
    expect(message?.fileSource).toEqual({
      filePath: "/store/media/openclaw-simplex/photo---uuid.jpg",
    });
  });

  it("stages the download in the shared outbound folder when one is configured", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "sx-remote-"));
    const readRemoteMediaBuffer = vi.fn(async () => ({
      buffer: Buffer.from("IMG-BYTES"),
      contentType: "image/jpeg",
      fileName: "photo.jpg",
    }));
    const saveRemoteMedia = vi.fn();
    installRuntime({ saveRemoteMedia, readRemoteMediaBuffer });
    const cfg: OpenClawConfig = {
      channels: { "openclaw-simplex": { connection: { outboundFolder: dir } } },
    };

    const [message] = await buildComposedMessages({ cfg, mediaUrl: PHOTO_URL });

    expect(saveRemoteMedia).not.toHaveBeenCalled();
    const staged = message?.fileSource?.filePath ?? "";
    expect(path.dirname(staged)).toBe(dir);
    expect(await readFile(staged, "utf8")).toBe("IMG-BYTES");
  });
});
