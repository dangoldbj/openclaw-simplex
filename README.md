# @dangoldbj/openclaw-simplex

> **TL;DR:** Run OpenClaw agents over SimpleX with no phone numbers, no hosted or unofficial bot APIs, and full end-to-end encryption.

Privacy-first SimpleX messaging channel for OpenClaw.

This plugin enables OpenClaw agents to communicate over SimpleX, a decentralized, end-to-end encrypted messaging network, without requiring phone numbers, hosted bot APIs, or third-party infrastructure.

It introduces a new class of channel for OpenClaw: **local-first, self-hostable, and identity-minimal agent communication.**

Designed for real-world OpenClaw deployments where privacy, local control, and minimal external dependencies are required.

---

## Why this plugin exists

OpenClaw supports multiple messaging channels, but most rely on:

* phone numbers or platform-bound identities
* hosted bot APIs
* centralized infrastructure

This plugin adds support for SimpleX, enabling:

* fully end-to-end encrypted messaging
* no global identifiers, so no phone or email is required
* self-hosted or local-first operation
* agent communication without third-party dependencies

**This adds a privacy-first messaging option to the OpenClaw channel set.**

### How This Differs From Typical Bot/API Channels

Unlike typical messaging integrations (e.g. bot APIs or phone-based channels), this plugin:

* does not require phone numbers
* does not depend on hosted or unofficial bot APIs
* uses end-to-end encrypted messaging by default
* inherits stronger privacy properties from SimpleX, including reduced metadata exposure compared with typical bot-platform channels

---

## Why SimpleX

SimpleX is uniquely suited for privacy-critical communication:

* no user identifiers, so no phone or email
* end-to-end encrypted by default
* decentralized relay architecture
* fully supports self-hosting

This plugin integrates SimpleX into OpenClaw as a dedicated channel backed by the official `simplex-chat` CLI.

---

## What this plugin provides

* send and receive messages reliably, including text and media
* pairing and allowlist support
* invite link and QR generation
* shared `message` actions including `upload-file`, reactions, edits, deletes, and group actions
* plugin tools for invite and group administration
* runtime status and lifecycle management
* Control UI configuration
* external WebSocket runtime integration
* explicit runtime and policy control

---

## Use Cases

* running OpenClaw agents in fully self-hosted environments
* privacy-sensitive workflows with no external messaging providers
* peer-to-peer agent communication without global identifiers
* secure local automation systems
* experimental decentralized agent networks

This plugin is particularly relevant for developers building privacy-first or fully self-hosted agent systems.

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

Trust plugin:

```bash
openclaw config set plugins.allow "$(
  (openclaw config get plugins.allow --json 2>/dev/null || echo '[]') \
  | jq -c '. + ["openclaw-simplex"] | unique'
)" --strict-json
```

This appends `openclaw-simplex` to the existing allowlist instead of replacing it.

Important:

* `openclaw plugins enable openclaw-simplex` only enables the plugin
* OpenClaw will not start the SimpleX channel until `channels.openclaw-simplex.connection` is configured
* The current Control UI SimpleX card is a config editor; it does not expose custom invite buttons for this plugin
* configure `channels.openclaw-simplex.connection.wsUrl` to the running SimpleX WebSocket endpoint
* The interactive `openclaw channels add` picker may not list this external plugin yet

## Migration from `simplex`

`1.0.0` renames both the plugin id and the channel id from `simplex` to `openclaw-simplex`.

If you are upgrading from `0.x`, run:

```bash
openclaw simplex migrate
```

This migrates:

* `plugins.entries.simplex` -> `plugins.entries.openclaw-simplex`
* `plugins.installs.simplex` -> `plugins.installs.openclaw-simplex`
* `plugins.allow` / `plugins.deny` entries from `simplex` -> `openclaw-simplex`
* `channels.simplex` -> `channels.openclaw-simplex`
* OpenClaw pairing and allowlist state files under the OpenClaw state directory

You can preview the changes first:

```bash
openclaw simplex migrate --dry-run
```

Breaking changes in `1.0.0`:

* managed mode was removed; run `simplex-chat` separately and configure `wsUrl`
* the plugin id is now `openclaw-simplex`
* the channel id is now `openclaw-simplex`
* pairing approval commands now use `openclaw-simplex`
* gateway method names remain `simplex.invite.*`; they were not renamed in this release

## Invite Link Generation

For day-to-day use, the simplest way to create or inspect SimpleX invite links is the `simplex-chat` CLI itself:

```text
/c
/ad
/show_address
/delete_address
```

These correspond to:

* `/c`: create a one-time connect link
* `/ad`: create or return the account address link
* `/show_address`: show the current address link
* `/delete_address`: revoke the current address link

OpenClaw also exposes the same flows through gateway methods and plugin tools for automation:

* `simplex.invite.create`
* `simplex.invite.list`
* `simplex.invite.revoke`

---

## How It Works

1. OpenClaw loads the plugin and registers the `openclaw-simplex` channel
2. OpenClaw can load the lightweight setup entry before the full runtime entry for disabled or unconfigured channels
3. The channel only becomes startup-capable after `channels.openclaw-simplex.connection` is configured
4. The plugin connects to SimpleX via the CLI WebSocket API
5. Incoming messages are normalized into OpenClaw context
6. OpenClaw applies policies such as `dmPolicy` and `allowFrom`
7. Responses are sent back through SimpleX

---

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

---

## Runtime Connection

Run `simplex-chat` separately and point OpenClaw at its WebSocket endpoint:

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

---

## Security Model

* channel-level sender gating such as `dmPolicy` and `allowFrom`
* pairing-based approval flow
* explicit control over runtime boundaries
* no reliance on external messaging APIs

---

## Example Commands

```bash
openclaw plugins list
openclaw plugins info openclaw-simplex
openclaw channels add --channel openclaw-simplex --url ws://127.0.0.1:5225
openclaw simplex migrate --dry-run
openclaw pairing list
```

Invite APIs:

* `simplex.invite.create`
* `simplex.invite.list`
* `simplex.invite.revoke`

Plugin tools:

* `simplex_invite_create`
* `simplex_invite_list`
* `simplex_invite_revoke`
* `simplex_group_add_participant`
* `simplex_group_remove_participant`
* `simplex_group_leave`

---

## Troubleshooting

* plugin not visible: check `plugins.allow` and `openclaw plugins list`
* channel not starting: verify `channels.openclaw-simplex.connection` exists and points to a working SimpleX runtime
* `Configured No`: add explicit `channels.openclaw-simplex.connection` config; plugin defaults alone are not enough for OpenClaw startup
* inbound issues: review policies such as `allowFrom`, `dmPolicy`, and group policy
* media issues: validate URLs and size limits

---

## Happy Path

1. Open `Control -> Channels -> SimpleX`
2. Start `simplex-chat` separately and configure OpenClaw with its `wsUrl`
3. Generate an invite link in `simplex-chat` or through the gateway/tool automation path
4. Connect via the SimpleX app
5. Approve pairing in OpenClaw
6. Send a message and verify the response

Full walkthrough:

* https://dangoldbj.github.io/openclaw-simplex/guide/getting-started

---

## Screenshots

Pairing and approval flow screenshots:

* https://dangoldbj.github.io/openclaw-simplex/guide/getting-started

---

## Full Docs

* https://dangoldbj.github.io/openclaw-simplex/
