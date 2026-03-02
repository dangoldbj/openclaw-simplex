# @dangoldbj/openclaw-simplex

SimpleX channel plugin for OpenClaw.

## Why SimpleX

SimpleX is a strong fit when you want a messaging channel with privacy-first defaults and self-hostable infrastructure options. This plugin lets OpenClaw use SimpleX as a production message channel without custom glue code.

## Install

```bash
npm i @dangoldbj/openclaw-simplex
openclaw plugins install @dangoldbj/openclaw-simplex
openclaw plugins enable simplex
```

## How It Works

1. OpenClaw loads the plugin and registers the `simplex` channel.
2. The channel connects to SimpleX via the SimpleX CLI WebSocket API.
3. Inbound events are normalized into OpenClaw message context.
4. OpenClaw runs policy checks (`dmPolicy`, `allowFrom`, group policy).
5. Replies/actions are sent back through SimpleX.

## External vs Managed

- `managed`: OpenClaw starts `simplex-chat` for you.
- `external`: you run SimpleX separately; OpenClaw only connects to `wsUrl`.

Managed mode example:

```json
{
  "channels": {
    "simplex": {
      "enabled": true,
      "connection": {
        "mode": "managed",
        "cliPath": "simplex-chat",
        "wsHost": "127.0.0.1",
        "wsPort": 5225
      },
      "allowFrom": ["*"]
    }
  }
}
```

External mode example:

```json
{
  "channels": {
    "simplex": {
      "enabled": true,
      "connection": {
        "mode": "external",
        "wsUrl": "ws://127.0.0.1:5225"
      },
      "allowFrom": ["*"]
    }
  }
}
```

## Security Model

- Channel-level sender gating: `dmPolicy`, `allowFrom`, `groupPolicy`, `groupAllowFrom`.
- Pairing mode support for explicit sender approval.
- No hard dependency on public cloud relay for your OpenClaw runtime.
- You control process/network boundaries in managed vs external mode.

## Example Commands

```bash
openclaw plugins list
openclaw plugins info simplex
```

Gateway invite methods exposed by this plugin:

- `simplex.invite.create`
- `simplex.invite.list`
- `simplex.invite.revoke`

## Troubleshooting

- Plugin not visible: run `openclaw plugins list`, then restart OpenClaw.
- Channel not starting: verify `connection` settings and SimpleX WS reachability.
- Inbound drops: review `dmPolicy`, `allowFrom`, `groupPolicy`, `groupAllowFrom`.
- Media issues: validate URL accessibility and `mediaMaxMb` limits.

## Screenshots

Store screenshots in `docs/public/images/` and reference as:

```md
![SimpleX setup](/images/simplex-setup.png)
```

## What It Adds

- Channel id: `simplex`
- Outbound text/media delivery through SimpleX CLI WS API
- Inbound monitor + account runtime tracking
- Directory resolution helpers
- Invite gateway methods

## Development

```bash
pnpm install
pnpm run test
pnpm run typecheck
pnpm run docs:build
pnpm run build
```

## Docs

- Local preview: `pnpm run docs:dev`
- Build static docs: `pnpm run docs:build`
- Published via GitHub Pages workflow: `.github/workflows/docs.yml`
- Docs entrypoint: `docs/index.md`

## Publish

```bash
pnpm publish --access public --provenance
```

## GitHub Actions

- `CI` workflow runs test, typecheck, and build on pushes/PRs.
- `Publish` workflow publishes to npm on release publish, `v*` tags, or manual trigger.
- `Docs` workflow publishes VitePress docs to GitHub Pages.
- Add repo secret `NPM_TOKEN` for publish workflow.
