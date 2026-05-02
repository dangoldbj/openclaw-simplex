# @dangoldbj/openclaw-simplex

> **TL;DR:** An OpenClaw channel for SimpleX Chat: invite-based reachability, end-to-end encrypted messaging, and no public bot account or hosted bot platform in the middle.

> **Breaking in 2.0.0:** The plugin now uses the official `simplex-chat` Node runtime only. The old WebSocket/CLI runtime configuration is no longer supported. If you are upgrading from any pre-2.0.0 install, run `openclaw simplex migrate`; see the [Migration guide](https://openclaw-simplex.mintlify.app/guide/migration).

---

Most agent chat channels in OpenClaw assume a platform bot identity: a bot username, a phone number, an app registration, or some other platform-managed endpoint.

This plugin takes a different route.

Within OpenClaw's channel ecosystem, it introduces a communication model where the contact path is created by a SimpleX one-time invite link or by the account's reusable SimpleX address rather than by platform bot registration. You generate the contact path, share it intentionally, and revoke the SimpleX address when it should no longer be usable.

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

**Upgrade from older installs:**

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
- One-time invite link, SimpleX address, and QR generation
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

By default, the plugin uses the same database prefix as the SimpleX terminal CLI: `~/.simplex/simplex_v1` on Linux/macOS and `%APPDATA%/simplex/simplex_v1` on Windows. Override `dbFilePrefix` only when you want a separate bot identity or a named account.

If your package manager blocks native dependency build scripts, approve the `simplex-chat` package build before starting OpenClaw. With pnpm, run:

```bash
pnpm approve-builds
```

**Important:**

- `openclaw plugins enable openclaw-simplex` only enables the plugin
- OpenClaw uses the SimpleX terminal CLI database prefix by default; set `channels.openclaw-simplex.dbFilePrefix` only for a separate profile
- The official Node runtime is the only supported runtime
- The interactive `openclaw channels add` picker may not list this external plugin yet
- The current Control UI SimpleX card is a config editor; it does not expose custom invite buttons for this plugin

---

## Minimal configuration

```json
{
  "channels": {
    "openclaw-simplex": {
      "enabled": true
    }
  }
}
```

The SimpleX runtime runs inside the OpenClaw plugin process through the official Node library.

With this minimal config, direct messages use the conservative default `dmPolicy: "pairing"`: a new contact can reach the SimpleX runtime, but OpenClaw will not run the agent for that sender until you approve the pairing request. Use `allowFrom` only when you want to pre-approve specific contacts, and use `allowFrom: ["*"]` only for deliberately broad reachability.

Keep the split clear:

- `channels.openclaw-simplex` is for OpenClaw-side channel behavior and Node runtime storage
- OpenClaw still owns policy and agent execution; the plugin translates events and runtime API calls

Docs:

- Runtime setup: https://openclaw-simplex.mintlify.app/guide/runtime-setup

---

## Operator CLI

The cleanest operator path is the plugin CLI:

```bash
# Runtime diagnostics
openclaw simplex runtime status
openclaw simplex runtime doctor

# One-time invite links and SimpleX addresses
openclaw simplex invite create --qr
openclaw simplex invite list
openclaw simplex address show --qr
openclaw simplex address revoke

# Pending SimpleX contact requests
openclaw simplex requests list
openclaw simplex requests accept --contact-request-id <id>
openclaw simplex requests reject --contact-request-id <id>

# SimpleX groups and group invite links
openclaw simplex groups create --display-name "OpenClaw Ops"
openclaw simplex groups link create --group-id <id> --role member --qr
openclaw simplex groups link revoke --group-id <id>

# Operator-controlled link onboarding
openclaw simplex connect plan --link "<simplex-link>"
openclaw simplex connect run --link "<simplex-link>"
```

For automation and integrations, OpenClaw exposes gateway methods for one-time invite and SimpleX address management, runtime diagnostics, pending contact requests, group links, and operator-controlled link onboarding. See the [Gateway Methods reference](https://openclaw-simplex.mintlify.app/reference/gateway-methods).

---

## Migration

Older `0.x` installs used the `simplex` plugin and channel ids. Early `openclaw-simplex` installs could also contain legacy WebSocket/CLI runtime fields. Current installs use `openclaw-simplex` for both plugin and channel ids, with the official SimpleX Node runtime config shape.

If you are upgrading either shape, run:

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
- legacy nested `connection.*` runtime fields to top-level account fields where applicable
- legacy WebSocket/CLI runtime fields such as `wsUrl`, `url`, `host`, `port`, `token`, `managed`, and `cliPath` out of the SimpleX channel config
- OpenClaw pairing and allowlist state files under the OpenClaw state directory

Current note:

- The current plugin id is `openclaw-simplex`
- The current channel id is `openclaw-simplex`
- Legacy invite gateway method names remain `simplex.invite.*`

---

## Security model

- Reachability starts with a SimpleX one-time invite link or SimpleX address
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
openclaw simplex runtime doctor
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
| Channel not starting | Verify the SimpleX database path is writable and the native runtime can start |
| `Configured No` | Add the channel section with `openclaw channels add --channel openclaw-simplex` |
| Inbound issues | Review `allowFrom`, `dmPolicy`, and group policy settings |
| Media issues | Validate URLs and check size limits |

---

## Happy path

1. Open `Control → Channels → SimpleX`
2. Configure OpenClaw with the Node runtime
3. Run `openclaw simplex invite create --qr` to generate a one-time invite
4. Scan the QR code with the SimpleX app
5. Approve pairing in OpenClaw
6. Send a message and verify the response

Full walkthrough: https://openclaw-simplex.mintlify.app/guide/getting-started

---

## Full docs

https://openclaw-simplex.mintlify.app/
