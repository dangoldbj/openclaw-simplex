# @dangoldbj/openclaw-simplex

> **TL;DR:** An OpenClaw channel for SimpleX Chat: invite-based reachability, end-to-end encrypted messaging, and no public bot account or hosted bot platform in the middle.

---

Most agent chat channels in OpenClaw assume a platform bot identity: a bot username, a phone number, an app registration, or some other platform-managed endpoint.

This plugin takes a different route.

Within OpenClaw's channel ecosystem, it introduces a communication model where the contact path is created by a SimpleX invite or address link rather than by platform bot registration. You generate the link, you share it intentionally, and you revoke it when needed.

That changes where reachability comes from. The agent does not depend on a public bot-facing identity, and OpenClaw policy sits on top of that link-based contact surface instead of depending on platform-native bot identity.

---

## Why this matters

**Private, bounded agent access.** A lawyer spinning up an AI assistant for a single client engagement. An HR department running anonymous employee feedback. A therapist giving a patient after-hours access to a support agent. These all benefit from a channel where reachability starts with a link you intentionally shared, not with a public bot endpoint.

**Self-hosted transport, not only self-hosted inference.** If you're running OpenClaw on your own infrastructure and want the runtime and relay path under your control, SimpleX makes that possible. By default the plugin uses the official SimpleX Node runtime in-process, and SimpleX relays are self-hostable. If you run the runtime and relays inside your environment, the whole path can stay under your infrastructure.

**Agent-to-agent chat transport without a platform account layer.** Two OpenClaw instances, each with this plugin, can exchange chat messages over SimpleX without relying on a shared bot API platform, phone-number-based identity, or workspace app registration. This is chat transport, not an implementation of OpenClaw's native federated A2A/session protocol over SimpleX.

**Peer access without platform account onboarding.** You can let someone interact with your agent without asking them to create an account on a platform you control. In the common case, a user installs SimpleX, scans your QR code, and the contact path exists.

---

## Quick Start

**Fresh install:**

1. Install and enable the plugin:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
openclaw plugins enable openclaw-simplex
```

2. Configure the channel with the official Node runtime:

```bash
openclaw channels add --channel openclaw-simplex
```

3. Generate an invite link:

```bash
openclaw simplex invite create --qr
```

Scan it with the SimpleX app. That's it: your agent is reachable over SimpleX without a public bot account.

**Upgrade from older `simplex` ids:**

```bash
openclaw simplex migrate
```

Full docs: https://openclaw-simplex.mintlify.app/

---

## How it works

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
            | - account/runtime state |
            +------------+------------+
                         |
                         | Node runtime API
                         v
            +-------------------------+
            |  SimpleX Node Runtime   |
            |      (simplex-chat)     |
            +------------+------------+
                         |
                         | network
                         v
            +-------------------------+
            |      SimpleX Network    |
            +-------------------------+
```

The plugin connects OpenClaw to SimpleX through the official `simplex-chat` Node runtime by default. Incoming messages are normalized into the standard OpenClaw message context. OpenClaw applies your policies (`dmPolicy`, `allowFrom`, group policy), runs the agent, and sends the response back through SimpleX.

There is no separate `simplex-chat` CLI process and no local WebSocket API to expose or supervise. The SimpleX runtime lives inside the OpenClaw plugin process through the official Node/FFI package.

---

## What this plugin provides

- Direct and group messaging over SimpleX
- Media send/receive support
- Pairing approval, exec approval auth, and allowlist enforcement
- Invite link, address link, and QR generation
- Shared `message` actions including `upload-file`, reactions, polls, edits, deletes, and group actions
- Plugin tools and gateway methods for invites, runtime diagnostics, contact requests, group links, and operator-controlled link onboarding
- Runtime status reporting, command handling, heartbeat readiness, and Control UI configuration
- Official SimpleX Node runtime integration

---

## Install

### 1. Install in OpenClaw

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
```

Enable:

```bash
openclaw plugins enable openclaw-simplex
```

Trust the plugin:

```bash
openclaw config set plugins.allow "$(
  (openclaw config get plugins.allow --json 2>/dev/null || echo '[]') \
  | jq -c '. + ["openclaw-simplex"] | unique'
)" --strict-json
```

This appends `openclaw-simplex` to the existing allowlist instead of replacing it.

---

### 2. Configure the default Node runtime

```bash
openclaw channels add --channel openclaw-simplex
```

This writes channel config that uses the official Node runtime. The default SimpleX database file prefix is `~/.openclaw/simplex/openclaw-simplex`.

If your package manager blocks native dependency build scripts, approve the `simplex-chat` package build before starting OpenClaw. With pnpm, run:

```bash
pnpm approve-builds
```

**Important:**

- `openclaw plugins enable openclaw-simplex` only enables the plugin
- OpenClaw will not start the SimpleX channel until `channels.openclaw-simplex.connection` is configured
- The official Node runtime is the only supported runtime
- The interactive `openclaw channels add` picker may not list this external plugin yet
- The current Control UI SimpleX card is a config editor; it does not expose custom invite buttons for this plugin

---

## Minimal configuration

```json
{
  "channels": {
    "openclaw-simplex": {
      "enabled": true,
      "connection": {},
      "allowFrom": ["*"]
    }
  }
}
```

The SimpleX runtime runs inside the OpenClaw plugin process through the official Node library.

Keep the split clear:

- `channels.openclaw-simplex` is for OpenClaw-side channel behavior and Node runtime storage
- OpenClaw still owns policy and agent execution; the plugin translates events and runtime API calls

Docs:

- Runtime setup: https://openclaw-simplex.mintlify.app/guide/runtime-setup

---

## Invite and address management

The cleanest path is the plugin CLI:

```bash
# Create a one-time invite link (prints terminal QR with --qr)
openclaw simplex invite create --qr

# List current invite and address state
openclaw simplex invite list

# Show the current address link
openclaw simplex address show --qr

# Revoke the current address link
openclaw simplex address revoke
```

For automation and integrations, OpenClaw exposes gateway methods for invite/address management, runtime diagnostics, pending contact requests, group links, and operator-controlled link onboarding. See the [Gateway Methods reference](https://openclaw-simplex.mintlify.app/reference/gateway-methods).

---

## Migration from `simplex`

Older `0.x` installs used the `simplex` plugin and channel ids.

If you are upgrading from `0.x`, run:

```bash
openclaw simplex migrate
```

Preview changes first:

```bash
openclaw simplex migrate --dry-run
```

This migrates:

- `plugins.entries.simplex` → `plugins.entries.openclaw-simplex`
- `plugins.installs.simplex` → `plugins.installs.openclaw-simplex`
- `plugins.allow` / `plugins.deny` entries from `simplex` → `openclaw-simplex`
- `channels.simplex` → `channels.openclaw-simplex`
- OpenClaw pairing and allowlist state files under the OpenClaw state directory

Current note:

- The current plugin id is `openclaw-simplex`
- The current channel id is `openclaw-simplex`
- Legacy invite gateway method names remain `simplex.invite.*`

---

## Security model

- Reachability starts with a SimpleX invite or address link
- OpenClaw applies sender gating via `dmPolicy`, `allowFrom`, and group policy
- Pairing-based approval can require explicit acceptance before a new contact can trigger the agent
- Same-chat exec approvals are supported for authorized SimpleX senders
- The SimpleX runtime is embedded through the official Node library; there is no separate local WebSocket control surface
- The plugin does not depend on a platform bot registry or hosted messaging API

---

## Example commands

```bash
openclaw plugins list
openclaw plugins info openclaw-simplex
openclaw channels add --channel openclaw-simplex
openclaw simplex migrate --dry-run
openclaw simplex invite create --qr
openclaw pairing list
```

**Plugin tools:**
- `simplex_invite_create`
- `simplex_invite_list`
- `simplex_invite_revoke`
- `simplex_group_add_participant`
- `simplex_group_remove_participant`
- `simplex_group_leave`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Plugin not visible | Check `plugins.allow` and run `openclaw plugins list` |
| Channel not starting | Verify `channels.openclaw-simplex.connection` exists and the Node runtime can write its database path |
| `Configured No` | Add explicit `channels.openclaw-simplex.connection` config; plugin defaults alone are not enough for startup |
| Inbound issues | Review `allowFrom`, `dmPolicy`, and group policy settings |
| Media issues | Validate URLs and check size limits |

---

## Happy path

1. Open `Control → Channels → SimpleX`
2. Configure OpenClaw with the Node runtime
3. Run `openclaw simplex invite create --qr` to generate an invite
4. Scan the QR code with the SimpleX app
5. Approve pairing in OpenClaw
6. Send a message and verify the response

Full walkthrough: https://openclaw-simplex.mintlify.app/guide/getting-started

---

## Full docs

https://openclaw-simplex.mintlify.app/
