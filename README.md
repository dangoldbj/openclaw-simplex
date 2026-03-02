# @dangoldbj/openclaw-simplex

SimpleX channel plugin for OpenClaw.

## Install

```bash
npm i @dangoldbj/openclaw-simplex
```

Then install/enable in OpenClaw:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
openclaw plugins enable simplex
```

## Minimal OpenClaw Config

```json
{
  "channels": {
    "simplex": {
      "enabled": true,
      "connection": {
        "mode": "managed",
        "cliPath": "simplex-chat"
      },
      "allowFrom": ["*"]
    }
  }
}
```

For externally managed SimpleX WS:

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

## What It Adds

- Channel id: `simplex`
- Outbound text/media delivery through SimpleX CLI WS API
- Inbound monitor + account runtime tracking
- Directory resolution helpers
- Invite gateway methods:
  - `simplex.invite.create`
  - `simplex.invite.list`
  - `simplex.invite.revoke`

## Development

```bash
npm install
npm run test
npm run typecheck
npm run build
```

## Publish

```bash
npm publish --access public
```

## GitHub Actions

- `CI` workflow runs test, typecheck, and build on pushes/PRs.
- `Publish` workflow publishes to npm on release publish, `v*` tags, or manual trigger.
- Add repo secret `NPM_TOKEN` before using publish workflow.
