# @dangoldbj/openclaw-simplex

> **TL;DR:** Your OpenClaw agent, reachable only by people you've invited — no phone number, no bot username, no hosted bot platform in the middle.

> **Breaking in `1.0.0`:** the plugin id and channel id are now `openclaw-simplex`, managed mode was removed, and existing users should run `openclaw simplex migrate`. See the [migration guide](https://openclaw-simplex.mintlify.app/guide/migration).

---

Every other channel you can give an OpenClaw agent has something in common: the agent exists as a registered thing. A Telegram bot username. A WhatsApp number. A Discord application ID. Something that lives on a platform, can be discovered, enumerated, or revoked by someone other than you.

This plugin is different.

Within OpenClaw's channel ecosystem, this enables a communication model that does not rely on platform identity or bot registration.

With SimpleX, your agent has no persistent address until you hand someone a link. The link is the identity. You generate it, you share it, you revoke it. There's no bot registry. No platform account tying the agent to a registered identity. No phone number.

**This is the first OpenClaw channel where the agent is an invitation, not a service.**

That distinction is quiet but significant. It means you can run an agent that only the people you've explicitly handed a link to can reach — and when you revoke that link, the door closes cleanly. No deregistration flow. No platform support ticket. Just `openclaw simplex address revoke`.

---

## What you can build with this

**Temporary expert agents for sensitive conversations.** A lawyer spinning up an AI assistant for a single client engagement. An HR department running anonymous employee feedback. A therapist giving a patient after-hours access to a support agent. These all require the agent to feel genuinely private and bounded — not "private as a policy" but private as a structural fact.

**Self-hosted automation with no external dependencies.** If you're running OpenClaw on your own infrastructure and the requirement is that nothing leaves your network, every other channel breaks that. This one doesn't. SimpleX relays are self-hostable, the CLI runs locally, and the plugin connects to it over a local WebSocket. The entire stack can live on one machine.

**Agent-to-agent communication without a platform account layer.** Two OpenClaw instances, each with this plugin, talking to each other over SimpleX. No shared bot API platform. No phone-number or app-account dependency. SimpleX relays are self-hostable — and if you run your own inside an isolated network, the entire path stays off third-party infrastructure. This is a foundation for private multi-agent systems that can stay fully internal to your network boundary.

**Peer access without account creation.** You want to let someone interact with your agent without asking them to create an account on anything. SimpleX requires no phone number or email — a user downloads the app and scans your QR code. That's the entire onboarding.

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

Scan it with the SimpleX app. That's it — you're talking to your agent over end-to-end encrypted messaging with no external accounts.

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

The plugin connects OpenClaw to a locally running `simplex-chat` process via its WebSocket API. Incoming messages are normalized into the standard OpenClaw message context — the same pipeline used by every other channel. OpenClaw applies your policies (`dmPolicy`, `allowFrom`, group policy), runs the agent, and sends the response back through SimpleX.

The key difference from managed-mode channels: OpenClaw does not own or supervise the `simplex-chat` process. You run it separately, point OpenClaw at its WebSocket endpoint, and the channel becomes operational. This gives you full control over the runtime lifecycle.

---

## What this plugin provides

- Send and receive messages, including text and media
- Pairing and allowlist support
- Invite link and QR generation
- Shared `message` actions: `upload-file`, reactions, edits, deletes, group actions
- Plugin tools for invite and group administration
- Runtime status and lifecycle management
- Control UI configuration
- External WebSocket runtime integration
- Explicit runtime and policy control

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

## Configuration

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

For full persistent runtime examples: https://openclaw-simplex.mintlify.app/guide/setup

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

- Channel-level sender gating via `dmPolicy` and `allowFrom`
- Pairing-based approval flow — new contacts require explicit acceptance
- Explicit control over runtime boundaries — OpenClaw does not auto-spawn processes
- No reliance on external messaging APIs
- No bot registration or platform-bound identifier for the agent

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
