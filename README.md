# @dangoldbj/openclaw-simplex

SimpleX channel plugin for OpenClaw.

## Why SimpleX

SimpleX is a strong fit when you want a messaging channel with privacy-first defaults and self-hostable infrastructure options. This plugin lets OpenClaw use SimpleX as a production message channel without custom glue code.

SimpleX channel here is backed by local `simplex-chat` CLI and supports send/receive (text/media), pairing + allowlist, message actions, invite link + QR generation, onboarding/status, and Control UI config parity.

Why this matters:

- privacy-preserving, end-to-end encrypted option in the channel set
- local runtime via official `simplex-chat` (no hosted bot service)
- no phone number requirement
- no third-party bot API dependency
- avoids unofficial CLI dependency chains
- low risk to other channels (opt-in and isolated unless configured)

## Install

Package:

`npm`

```bash
npm i @dangoldbj/openclaw-simplex
```

`pnpm`

```bash
pnpm add @dangoldbj/openclaw-simplex
```

`yarn`

```bash
yarn add @dangoldbj/openclaw-simplex
```

OpenClaw plugin setup:

Install plugin in OpenClaw:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
```

Enable plugin:

```bash
openclaw plugins enable simplex
```

## How It Works

1. OpenClaw loads the plugin and registers the `simplex` channel.
2. The channel connects to SimpleX via the SimpleX CLI WebSocket API.
3. Inbound events are normalized into OpenClaw message context.
4. OpenClaw runs policy checks (`dmPolicy`, `allowFrom`, group policy).
5. Replies/actions are sent back through SimpleX.

## Architecture

```text
            +-------------------------+
            |        OpenClaw         |
            |  (agent + router/core)  |
            +------------+------------+
                         |
                         | channel plugin API
                         v
            +-------------------------+
            | @dangoldbj/openclaw-    |
            |        simplex          |
            | - inbound monitor       |
            | - outbound actions      |
            | - policy enforcement    |
            | - account/runtime state |
            +------------+------------+
                         |
                         | WebSocket API
                         v
            +-------------------------+
            |   SimpleX CLI Runtime   |
            |      (simplex-chat)     |
            +------------+------------+
                         |
                         | network
                         v
            +-------------------------+
            |      SimpleX Network    |
            +-------------------------+
```

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

## Happy Path

1. Open `Control -> Channels -> SimpleX`.
2. Click `Create 1-time Link` and scan QR in the SimpleX app.
3. Send a first message in the SimpleX app and note the pairing approval code.
4. Run `pnpm openclaw pairing list`, then approve in OpenClaw.
5. Send another message and confirm OpenClaw responds.

Full walkthrough with screenshots:

- https://dangoldbj.github.io/openclaw-simplex/guide/getting-started

## Screenshots

Control UI channel view:

![SimpleX channel card before invite generation](./docs/public/images/control-ui.png)

See full invite flow screenshots:

- https://dangoldbj.github.io/openclaw-simplex/guide/getting-started

## Full Docs

- https://dangoldbj.github.io/openclaw-simplex/
