import { defineConfig } from "vitepress";

export default defineConfig({
  title: "OpenClaw SimpleX",
  description: "SimpleX channel plugin for OpenClaw",
  base: "/openclaw-simplex/",
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Reference", link: "/reference/config" },
      { text: "GitHub", link: "https://github.com/dangoldbj/openclaw-simplex" },
      { text: "npm", link: "https://www.npmjs.com/package/@dangoldbj/openclaw-simplex" },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Why SimpleX", link: "/guide/why-simplex" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "How It Works", link: "/guide/how-it-works" },
          { text: "Architecture", link: "/guide/architecture" },
          { text: "External vs Managed", link: "/guide/external-vs-managed" },
          { text: "Security Model", link: "/guide/security-model" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Configuration", link: "/reference/config" },
          { text: "Gateway Methods", link: "/reference/gateway-methods" },
          { text: "Example Commands", link: "/reference/example-commands" },
          { text: "Screenshots", link: "/reference/screenshots" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/dangoldbj/openclaw-simplex" }],
  },
});
