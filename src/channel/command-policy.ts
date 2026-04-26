import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";

export const simplexCommandPolicy: NonNullable<ChannelPlugin["commands"]> = {
  skipWhenConfigEmpty: true,
};
