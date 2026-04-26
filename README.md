# @dangoldbj/openclaw-simplex

> **TL;DR:** An OpenClaw channel for SimpleX Chat: invite-based reachability, end-to-end encrypted messaging, and no public bot account or hosted bot platform in the middle.

> **Breaking in `1.0.0`:** the plugin id and channel id are now `openclaw-simplex`, managed mode was removed, and existing users should run `openclaw simplex migrate`. See the [migration guide](https://openclaw-simplex.mintlify.app/guide/migration).

---

Most agent chat channels in OpenClaw assume a platform bot identity: a bot username, a phone number, an app registration, or some other platform-managed endpoint.

This plugin takes a different route.

Within OpenClaw's channel ecosystem, it introduces a communication model where the contact path is created by a SimpleX invite or address link rather than by platform bot registration. You generate the link, you share it intentionally, and you revoke it when needed.

That changes where reachability comes from. The agent does not depend on a public bot-facing identity, and OpenClaw policy sits on top of that link-based contact surface instead of depending on platform-native bot identity.

---

## Why this matters

**Private, bounded agent access.** A lawyer spinning up an AI assistant for a single client engagement. An HR department running anonymous employee feedback. A therapist giving a patient after-hours access to a support agent. These all benefit from a channel where reachability starts with a link you intentionally shared, not with a public bot endpoint.

**Self-hosted transport, not only self-hosted inference.** If you're running OpenClaw on your own infrastructure and want the runtime and relay path under your control, SimpleX makes that possible. The CLI runs locally, the plugin connects to it over a local WebSocket, and SimpleX relays are self-hostable. If you run the runtime and relays inside your environment, the whole path can stay under your infrastructure.

**Agent-to-agent transport without a platform account layer.** Two OpenClaw instances, each with this plugin, can talk over SimpleX without relying on a shared bot API platform, phone-number-based identity, or workspace app registration. If you run your own relays inside an isolated environment, the path can stay off third-party infrastructure.

**Peer access without platform account onboarding.** You can let someone interact with your agent without asking them to create an account on a platform you control. In the common case, a user installs SimpleX, scans your QR code, and the contact path exists.

---

## Quick Start

**Fresh install:**

1. Install `simplex-chat`:

```bash
curl -o- https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash
```

2. Start the WebSocket runtime:

```bash
simplex-chat -p 5225
```

3. Install and enable the plugin:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
openclaw plugins enable openclaw-simplex
```

4. Configure the channel:

```bash
openclaw channels add --channel openclaw-simplex --url ws://127.0.0.1:5225
```

5. Generate an invite link:

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

The plugin connects OpenClaw to a locally running `simplex-chat` process via its WebSocket API. Incoming messages are normalized into the standard OpenClaw message context. OpenClaw applies your policies (`dmPolicy`, `allowFrom`, group policy), runs the agent, and sends the response back through SimpleX.

The key difference from managed-mode channels: OpenClaw does not own or supervise the `simplex-chat` process. You run it separately, point OpenClaw at its WebSocket endpoint, and the channel becomes operational. This gives you full control over the runtime lifecycle.

---

## What this plugin provides

- Direct and group messaging over SimpleX
- Media send/receive support
- Pairing approval and allowlist enforcement
- Invite link, address link, and QR generation
- Shared `message` actions including `upload-file`, reactions, edits, deletes, and group actions
- Plugin tools and gateway methods for invite and group administration
- Runtime status reporting and Control UI configuration
- External WebSocket runtime integration with explicit operator-managed lifecycle

---

## Install

### 1. Install SimpleX CLI (`simplex-chat`)

Official installer:

```bash
curl -o- https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash
```

If the official installer resolves the wrong Darwin/Linux target:

```bash
curl -o- https://raw.githubusercontent.com/dangoldbj/simplex-chat/install-arch-matrix/install.sh | bash
```

Verify:

```bash
simplex-chat -h
```

Start the long-running WebSocket process:

```bash
simplex-chat -p 5225
```

---

### 2. Install in OpenClaw

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
```

This release no longer requires the unsafe-install override because the plugin does not spawn `simplex-chat`.

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

**Important:**

- `openclaw plugins enable openclaw-simplex` only enables the plugin
- OpenClaw will not start the SimpleX channel until `channels.openclaw-simplex.connection` is configured
- Configure `channels.openclaw-simplex.connection.wsUrl` to point to the running SimpleX WebSocket endpoint
- If `simplex-chat` is not running at that endpoint, OpenClaw marks the channel disconnected and stores the error in channel status
- The interactive `openclaw channels add` picker may not list this external plugin yet
- The current Control UI SimpleX card is a config editor; it does not expose custom invite buttons for this plugin

---

## Minimal configuration

```json
{
  "channels": {
    "openclaw-simplex": {
      "enabled": true,
      "connection": {
        "wsUrl": "ws://127.0.0.1:5225"
      },
      "allowFrom": ["*"]
    }
  }
}
```

OpenClaw does not supervise `simplex-chat` for external plugins. If you want it to start automatically, run it as a host-managed user service such as `systemd --user` or `launchd`.

Keep the split clear:

- `channels.openclaw-simplex` is for OpenClaw-side channel behavior and the WebSocket endpoint
- `simplex-chat` CLI flags such as `--device-name`, `--files-folder`, `--temp-folder`, proxy settings, relay selection, and `--maintenance` belong in the external runtime service definition

For full persistent runtime examples and recommended startup-flag placement: https://openclaw-simplex.mintlify.app/guide/runtime-setup

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

You can also use the `simplex-chat` console directly:

| Command | Effect |
|---|---|
| `/c` | Create a one-time connect link |
| `/ad` | Create or return the account address link |
| `/show_address` | Show the current address link |
| `/delete_address` | Revoke the current address link |

For automation and integrations, OpenClaw exposes gateway methods:

- `simplex.invite.create`
- `simplex.invite.list`
- `simplex.invite.revoke`

---

## Migration from `simplex`

`1.0.0` renames both the plugin id and the channel id from `simplex` to `openclaw-simplex`.

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

**Breaking changes in `1.0.0`:**

- Managed mode was removed; run `simplex-chat` separately and configure `wsUrl`
- The plugin id is now `openclaw-simplex`
- The channel id is now `openclaw-simplex`
- Pairing approval commands now use `openclaw-simplex`
- Gateway method names remain `simplex.invite.*`; they were not renamed in this release

---

## Security model

- Reachability starts with a SimpleX invite or address link
- OpenClaw applies sender gating via `dmPolicy`, `allowFrom`, and group policy
- Pairing-based approval can require explicit acceptance before a new contact can trigger the agent
- OpenClaw does not auto-spawn `simplex-chat`; runtime control stays explicit
- The plugin does not depend on a platform bot registry or hosted messaging API

---

## Example commands

```bash
openclaw plugins list
openclaw plugins info openclaw-simplex
openclaw channels add --channel openclaw-simplex --url ws://127.0.0.1:5225
openclaw simplex migrate --dry-run
openclaw simplex invite create --qr
openclaw pairing list
```

**Gateway methods:**
- `simplex.invite.create`
- `simplex.invite.list`
- `simplex.invite.revoke`

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
| Channel not starting | Verify `channels.openclaw-simplex.connection` exists and points to a running SimpleX runtime |
| `Configured No` | Add explicit `channels.openclaw-simplex.connection` config; plugin defaults alone are not enough for startup |
| Inbound issues | Review `allowFrom`, `dmPolicy`, and group policy settings |
| Media issues | Validate URLs and check size limits |

---

## Happy path

1. Open `Control → Channels → SimpleX`
2. Start `simplex-chat` separately and configure OpenClaw with its `wsUrl`
3. Run `openclaw simplex invite create --qr` to generate an invite
4. Scan the QR code with the SimpleX app
5. Approve pairing in OpenClaw
6. Send a message and verify the response

Full walkthrough: https://openclaw-simplex.mintlify.app/guide/getting-started

---

## Full docs

https://openclaw-simplex.mintlify.app/
