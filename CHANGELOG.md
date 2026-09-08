# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-09-08

Requires OpenClaw `2026.9.3` or newer.

### Breaking

- **Raised the minimum supported OpenClaw version to `2026.9.3`** (floor `>=2026.9.3-0`). Earlier releases do not load on `2026.9.x` at all: `openclaw/plugin-sdk/text-runtime` and `openclaw/plugin-sdk/channel-streaming` were removed from the SDK's `exports`, so the plugin failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` before it could register anything (#32). Upgrading is the fix.
- **`openclaw channels add --url` was replaced by `--ws-url`.** The channel now owns its setup contract, so the host's legacy generic flags are no longer registered for it and `--url` fails as an unknown option. It never actually worked: the old adapter validated the value and then discarded it, silently falling back to the hardcoded loopback endpoint.
- **`openclaw channels add --name <id>` now creates an account named `<id>`.** It previously created `default` and ignored the name, because `normalizeAccountId(undefined)` returns a truthy `"default"`, which made the name branch unreachable.
- **Access-group gating for channel commands is always on.** OpenClaw `2026.8` removed `commands.useAccessGroups` from `CommandsConfig`, so the setting is no longer operator-disableable.
- **Dropped `messaging.parseExplicitTarget`.** OpenClaw `2026.8` removed the field and the host paths that consumed it; SimpleX target parsing continues through `messaging.targetResolver` and `messaging.resolveOutboundSessionRoute`, which this plugin already implemented.
- **Removed the `qrcode` runtime dependency.** It had been declared but never imported; QR rendering comes from the SDK.

### Added

- **Runtime endpoint setup from the CLI.** `openclaw channels add --channel openclaw-simplex` now accepts `--ws-url`, `--ws-host`, `--ws-port`, `--outbound-folder`, and `--allow-unsafe-remote-ws`. Previously setup wrote a hardcoded `127.0.0.1:5225` and any other deployment had to be configured by hand-editing `openclaw.json`. Setup also runs the same endpoint security check the client runs on connect, so an unsafe endpoint fails immediately with an actionable message instead of writing config that only breaks later.
- **A SimpleX tab in Control UI**, served by the plugin over a gateway-authenticated route. It shows each account's WebSocket endpoint, connection state, runtime version, active user profile, transport warnings, the current address link and a scannable QR code, plus who is waiting: pending contact requests and pairing approvals, each with the command that acts on it. The tab is read-only because OpenClaw authenticates plugin frames for reads only.
- **Automatic migration of the pre-1.0 `simplex` ids.** The plugin registers its config migration with OpenClaw, so a config still using the legacy plugin and channel ids is rewritten when it is loaded. `openclaw simplex migrate` is still needed once, because it is the only step that also renames the pairing and allowlist state files.
- **`openclaw doctor` integration.** It probes each configured runtime (unreachable endpoints, missing user profiles, capability mismatches, unsafe transports) and reports and repairs leftover pre-1.0 configuration. Set `OPENCLAW_SIMPLEX_DOCTOR_SKIP_RUNTIME_PROBE=1` to skip the probe.
- **A runtime identity check.** After connecting, and again after every reconnect, the plugin confirms the endpoint answers as a `simplex-chat` runtime. The SimpleX WebSocket API is unauthenticated by design, so this catches a stale service, a port taken by something else, or simply the wrong port in config, instead of talking to it silently.
- **Startup and teardown maintenance.** Outbound media staged before a crash is reclaimed at startup; runtime clients are closed and aged staged media is reclaimed when the plugin is disabled or restarted. Removing an account now clears its contact requests, pairing requests and dedupe markers.
- **Onboarding detection.** When no SimpleX account is configured and a local runtime state directory exists, OpenClaw's setup surfaces the channel instead of leaving it undiscovered.
- **Gateway method descriptors** carrying the scope and description of all 22 `simplex.*` methods, and a `conversationBindings` declaration so a SimpleX conversation can be bound to a specific agent.
- SimpleX CLI commands print a human-readable summary to a terminal and the same JSON as before when redirected or piped. `--json` forces JSON in a terminal.

### Fixed

- Fixed the plugin failing to load on OpenClaw `2026.9.x` (#32) — see Breaking, above.
- Fixed `openclaw simplex runtime doctor` crashing when the runtime was unreachable, which is the case it exists to diagnose. It now reports the endpoint, the underlying reason and what to do, and exits non-zero.
- Fixed SimpleX channel references being mangled on the action path. Every agent tool call targeting a channel had its `!` sigil treated as an unmarked id and rewritten to `@!news`, so channel sends, deletes and reactions were addressed to a contact that does not exist.
- Fixed group and channel ids being accepted as approval approvers. The contact normalizer prefixed every unmarked value with `@`, so `#ops` reached the approver guard as `@#ops` and passed the check meant to reject it — a conversation id in `allowFrom` could approve its own requests.
- Fixed protocol ids accepting values that JavaScript numeric coercion silently changes: `"1e3"` was read as group id `1000`.
- Inbound attachments are attached as canonical media facts instead of the deprecated `MediaPath`/`MediaPaths`/`MediaType`/`MediaUrl` projection, which OpenClaw removes after 2026-10-01. The legacy keys were set after the turn context was finalized, so they never reached the canonical `media` field. Attachments now also carry best-effort duration and dimension metadata.
- Fixed long replies being silently dropped instead of split. `textChunkLimit` alone does nothing: the outbound dispatcher only splits when a `chunker` is also set, so messages beyond the SimpleX text limit were discarded (#17). *(Shipped in 1.8.0; recorded here because it was never in a changelog.)*

### Changed

- Zod is a direct dependency again, pinned to exactly `4.4.3`. OpenClaw `2026.8` removed the `openclaw/plugin-sdk/zod` subpath and depends on zod externally. The pin must match the host's zod exactly: a floating range resolves to a second physical copy, and schemas built with it are rejected by `buildChannelConfigSchema` with a variance error that never names the real cause.
- Migrated to the plugin SDK's current entrypoints: `normalizePollInput` from `media-runtime`, `resolvePollMaxSelections` from `channel-actions`, `resolveReactionLevel` from `status-helpers`, `OpenClawConfig` from `channel-core`, and the streaming preview chunk rebuilt on `getChannelStreamingConfigObject` from `channel-streaming-config`.
- Adopted the plugin-local `SimplexSetupInput` type ahead of the `plugin-sdk-channel-setup-input-fields` compatibility removal (#30), then replaced it entirely with the channel-owned setup contract.
- Test coverage is measured and gated in CI. The suite is 366 tests across 45 files; statement coverage rose from 58.75% to 69.38% and branch coverage from 53.18% to 65.06%, concentrated on the inbound monitor and the agent-facing action modules.

## [1.8.0] - 2026-07-19

### Changed

- Raised the minimum supported OpenClaw version to `2026.7.1` and aligned package compatibility metadata with the current plugin SDK surfaces.
- Version floors now carry an explicit `-0` prerelease suffix (`>=2026.7.1-0`). npm's `latest` tag resolves to `2026.7.1-2`, which sorts below `2026.7.1` under semver, so a plain floor would have rejected the version a default `npm install openclaw` produces.
- Zod schemas are now built with OpenClaw's own zod instance from `openclaw/plugin-sdk/zod` instead of a plugin-owned `zod` dependency, and `zod` was dropped from runtime dependencies.
- Replaced the duplicated hand-rolled positive-integer parsers in the gateway methods and plugin CLI with a shared `readRequiredPositiveInteger` helper backed by the SDK's `readPositiveIntegerParam`.
- Added an optional `mentionPatterns` account policy (`mode`/`allowIn`/`denyIn`) so agent name patterns can be scoped to specific SimpleX groups, and passed SimpleX provider/conversation context into OpenClaw's mention-regex builder, which previously ignored per-conversation mention policy.
- Added optional `draftChunk` live-draft chunking (`minChars`/`maxChars`/`breakPreference`) using OpenClaw's canonical config shape. Live drafts can now trim to paragraph, newline, or sentence boundaries and cap their length; the final reply is never truncated. This is dual-read and additive: when `draftChunk` is unset, the existing `streaming.minChars`/`streaming.wordBoundary` behavior and defaults are unchanged. `streaming.throttleMs` and `streaming.nativeTransport` remain plugin-owned because the host chunking model has no equivalent.
- Poll duration is now validated as a positive integer through the shared SDK schema helper instead of an unbounded integer.

### Fixed

- Fixed long replies being silently dropped instead of split. `textChunkLimit` alone does nothing: the outbound dispatcher only splits when a `chunker` is also set, so messages beyond the SimpleX text limit were discarded. Outbound config now sets `chunker: chunkTextForOutbound` with `chunkerMode: "markdown"` alongside the limit (#17). *(Shipped in 1.8.0; changelog entry added retroactively in 1.9.0.)*
- Fixed SimpleX channel config schema construction against OpenClaw `2026.7.x`, which inlines zod's types into its own bundled declarations. A plugin-owned zod no longer shares declaration identity with the host, so `buildCatchallMultiAccountChannelSchema` and `buildChannelConfigSchema` rejected the account schema and collapsed the inferred config type, breaking account-scoped policy fields in the runtime doctor and account resolution.
- Fixed protocol id parsing so unsafe integers beyond `Number.MAX_SAFE_INTEGER` are rejected instead of being silently rounded to a different id.
- Fixed inbound events being marked as seen before dispatch, which permanently dropped a message if the process stopped between the two. Dedupe is now recorded after the inbound turn is durably registered, so an interrupted turn replays instead of disappearing.
- Fixed oversized inbound attachments being dropped together with their caption. The message is now delivered with an explicit notice that the attachment exceeded the account limit.
- Fixed inbound attachments that time out or complete without a usable path arriving as an ordinary message with no indication that a file was missing.

## [1.7.3] - 2026-06-07

### Added

- Added SimpleX v6.5.4 payload fixture coverage for direct, group, file, command response, link extraction, and command error shapes.
- Added invite revocation coverage and documented the `openclaw simplex invite revoke` CLI flow.
- Added configurable `connection.directoryTimeoutMs` for live SimpleX directory and status probes.

### Changed

- Shared SimpleX directory/status probe behavior across channel directory lookups and runtime capability diagnostics.
- Narrowed inbound authorization and dispatch dependencies to smaller OpenClaw runtime interfaces for clearer channel boundaries.
- Reduced test-only broad casts and strengthened typed mock coverage.

### Fixed

- Fixed SimpleX inbound reply delivery so external channel replies bypass generic channel routing before delivery.
- Fixed outbound SimpleX target normalization for prefixed direct and group ids.
- Fixed SimpleX `/connect` and `/connect plan` link handling so native and short web invite links are passed unquoted.
- Fixed pending inbound file timeout cleanup when file transfers complete or are replaced.
- Treated SimpleX group directory counts as advisory in status and troubleshooting docs.

## [1.7.2] - 2026-06-04

### Fixed

- Avoided live SimpleX directory lookups for explicit SimpleX target ids such as `openclaw-simplex:4`, `#4`, `group:4`, or numeric group ids.
- Stopped provider-prefixed explicit group ids from being passed through to SimpleX `/_groups` search before replies, reducing repeated `/user` and `/_groups` calls on direct reply paths.

## [1.7.1] - 2026-06-03

### Added

- Added structured SimpleX runtime capability probes for runtime version, active user, user/contact/group counts, live replies, TTL, verification, moderation, file controls, and experimental channel posture.
- Added capability probe metadata to `simplex.runtime.status`, `simplex.runtime.doctor`, and channel status snapshots.
- Added docs guidance to run `openclaw simplex runtime doctor` after enabling SimpleX-native live replies.

### Changed

- Tightened SimpleX action numeric parameter parsing so partial numeric strings and decimal values are rejected for integer fields instead of being coerced or truncated.
- Clarified runtime capability probes as advisory WebSocket checks that do not spawn or manage `simplex-chat`.

### Fixed

- Treated SimpleX empty-list runtime responses as supported empty contact/group counts, avoiding false doctor failures on accounts with no groups.
- Fixed setup entry declaration output portability by adding an explicit setup entry type annotation.

## [1.7.0] - 2026-05-30

### Added

- Added opt-in SimpleX native live assistant replies for text responses. When `streaming.nativeTransport` is enabled, partial assistant text is sent with `live=on`, updated in place, and finalized on the same SimpleX chat item.
- Added account streaming controls for native live replies: `streaming.throttleMs`, `streaming.minChars`, and `streaming.wordBoundary`.
- Added outbound message TTL configuration through `messageTtlSeconds`, including support across normal sends, media sends, polls, action sends, and monitor replies.
- Added runtime user/profile, contact verification, group moderation, and file receive/cancel operations to the CLI and gateway method surfaces.
- Added status and doctor visibility for live-message configuration, TTL, file policy, runtime counts, and WebSocket transport posture.
- Added experimental `channel:<id>` / `!<id>` target parsing behind `experimentalChannels`.

### Changed

- Raised the minimum supported OpenClaw version to `2026.5.27` and aligned package compatibility metadata with the newer channel reply and delivery surfaces.
- Refreshed the static plugin manifest schema so the Control UI can render the new SimpleX account configuration fields.

### Fixed

- Kept SimpleX live reply failures on a safe fallback path: if live updates fail or the payload includes media, the plugin falls back to normal message delivery instead of retrying ambiguous sends.

## [1.6.0] - 2026-05-06

### Changed

- Kept the runtime path on the external `simplex-chat` WebSocket API and removed the direct Node runtime dependency experiment from this branch.
- Restored the package posture to MIT-compatible runtime boundaries by avoiding direct `simplex-chat` package embedding.
- Reworked the runtime adapter into a capability-oriented WebSocket client while preserving the newer services/actions/events architecture.
- Raised the minimum supported OpenClaw version to `2026.5.4` and wired the latest compatible channel metadata, target-prefix parsing, context visibility, media-source params, and security audit hooks.
- Updated README and docs for the current external-runtime architecture, generated runtime service install flow, reconnect behavior, Control UI limitations, and release requirements.

### Added

- Added SimpleX runtime service generation for `systemd --user`, `launchd`, and SysV init with interactive approval before writing files and printed follow-up supervisor commands.
- Added security audit findings for broad SimpleX policies and unsafe WebSocket endpoints.
- Added SimpleX link onboarding, contact-request, group-link, poll, reaction, edit/delete, media, and multi-account coverage across CLI, gateway methods, and message actions.

### Fixed

- Fixed external-plugin inbound event handling on OpenClaw hosts where keyed state stores are exposed but unavailable to external plugins.
- Fixed reconnect behavior after the external `simplex-chat` WebSocket runtime disconnects and later comes back.
- Fixed one-shot plugin CLI commands hanging after printing output by closing transient SimpleX WebSocket clients.
- Fixed Control UI/runtime status drift by aligning status inspection with resolved SimpleX accounts and manifest channel config schema metadata.
- Hardened WebSocket close/abort behavior, event subscription ordering, strict numeric CLI parsing, and service-manager detection.

## [1.5.0] - 2026-04-26

### Changed

- Added richer SimpleX channel parity surfaces on current OpenClaw releases, including same-chat exec approval auth, text-first presentation fallback, poll delivery support, command-policy wiring, heartbeat readiness, and heartbeat recipient resolution.
- Added channel action controls and reaction-level configuration for SimpleX so reactions and polls can be discovered and governed through the same OpenClaw-native patterns used by richer bundled channels.
- Refreshed README and docs to match the current external-runtime model and current channel capabilities, while removing stale release-era migration warnings from the main docs surfaces.

## [1.4.0] - 2026-04-24

### Changed

- Raised the minimum supported OpenClaw version to `2026.4.23` and aligned the package metadata/tests with the newer host release.
- Switched terminal QR rendering to OpenClaw's shared QR helper so plugin CLI output follows the current bounded host-side QR path used by newer OpenClaw releases.
- Moved SimpleX channel config `uiHints` into the runtime schema source and expanded Control UI metadata coverage for account, group, transport, and streaming fields so future manifest refreshes stay source-of-truth aligned.

## [1.3.5] - 2026-04-20

### Fixed

- Fixed SimpleX CLI command loading on newer OpenClaw hosts by avoiding the setup-runtime packaging path that suppressed plugin CLI registration.
- Fixed duplicate SimpleX CLI registration so `openclaw simplex ...` and `openclaw openclaw-simplex ...` both resolve cleanly.
- Fixed omitted-account invite and allowlist paths to use the plugin's configured default SimpleX account instead of assuming a literal `default` account id.

## [1.3.4] - 2026-04-20

### Fixed

- Added the legacy `simplex` manifest command alias so newer OpenClaw builds route `openclaw simplex ...` to this plugin instead of the bundled legacy plugin gate.

## [1.3.3] - 2026-04-13

### Changed

- Raised the minimum supported OpenClaw version to `2026.4.11`.
- Added manifest activation hints for `openclaw-simplex` so newer OpenClaw builds can narrow plugin activation more precisely.
- Added manifest-owned channel `uiHints` for the SimpleX config surface and fixed `manifest:sync` to preserve them.

### Fixed

- Updated the local `OpenClawPluginApi` test stub to match the current SDK shape used by newer OpenClaw releases.

## [1.3.2] - 2026-04-08

### Changed

- Tightened docs wording so the docs index and reference pages stay aligned with the README's current invite-based positioning and precision.
- Finished the remaining SDK import cleanup by moving the last `DEFAULT_ACCOUNT_ID` import onto `openclaw/plugin-sdk/account-id`.

## [1.3.1] - 2026-04-07

### Fixed

- Made `channels.openclaw-simplex.dmPolicy` optional again in the published plugin schema, so OpenClaw can install/update the plugin without requiring an explicit `dmPolicy` value in existing channel config.

## [1.3.0] - 2026-04-06

### Changed

- Raised the minimum supported OpenClaw version to `2026.4.5`.
- Migrated the plugin to OpenClaw's current channel SDK surfaces, including `plugin-sdk/channel-core`, `plugin-sdk/account-id`, and CLI metadata registration.

### Fixed

- Updated local test/runtime stubs to match the published `OpenClawPluginApi` shape in OpenClaw `2026.4.5`.

## [1.2.2] - 2026-04-05

### Fixed

- Stopped calling `/show_address` during routine channel status snapshots, so loading OpenClaw Control UI no longer triggers unnecessary address-link lookups against `simplex-chat`.

## [1.2.1] - 2026-04-04

### Changed

- Switched GitHub Actions workflows to Node.js 24 and removed the publish job's global npm self-upgrade step.
- Refined the docs structure and wording across Getting Started, Runtime Setup, architecture, security, troubleshooting, and reference pages.

### Fixed

- Added the channel config schema to `openclaw.plugin.json` and a schema drift test so OpenClaw Control UI can render the SimpleX card config editor from manifest metadata.

## [1.2.0] - 2026-04-04

### Changed

- Raised the minimum supported OpenClaw version to `2026.4.2`.
- Migrated the channel entrypoint to `defineChannelPluginEntry` and switched plugin runtime state to OpenClaw's `createPluginRuntimeStore`.
- Registered CLI command descriptors so `openclaw-simplex` and `simplex` plugin commands integrate with OpenClaw's current CLI metadata flow.
- Refreshed runtime and development dependencies, aligned TypeBox with OpenClaw's SDK dependency version, and migrated Biome config to Biome 2.
- Reworked README and docs around the invitation-first SimpleX channel model, explicit runtime boundaries, and ecosystem positioning.

### Fixed

- Removed TypeScript escape-hatch casts around channel tool schema registration and test/runtime stubs.
- Fixed stale docs wording that overstated platform and relay assumptions for default SimpleX deployments.

## [1.1.1] - 2026-04-01

### Fixed

- Narrowed the plugin-facing `allowFrom` and `groupAllowFrom` config schema to `string[]` for current OpenClaw Control UI compatibility.
- Kept the schema derived from OpenClaw's exported `AllowFromListSchema`, while adding a plugin-side narrowing step for safer rendering on OpenClaw `2026.3.31`.

## [1.1.0] - 2026-04-01

### Changed

- Aligned the SimpleX channel config schema more closely with OpenClaw's exported schema primitives and helpers.
- Replaced remaining local `allowFrom` and multi-account config composition with OpenClaw's shared config-schema APIs.
- Switched the setup adapter to OpenClaw's exported setup config patch helpers instead of local config-tree mutation code.

## [1.0.1] - 2026-04-01

### Fixed

- Replaced placeholder channel-config schema objects with OpenClaw's typed config primitives so the Control UI can render the SimpleX config surface without falling back to `Unsupported type: . Use Raw mode.`
- Preserved the `openclaw-simplex` `1.0.0` runtime and migration behavior while improving config editor compatibility.

## [1.0.0] - 2026-04-01

### Breaking Changes

- Renamed the plugin id from `simplex` to `openclaw-simplex`.
- Renamed the channel id from `simplex` to `openclaw-simplex`.
- Removed managed mode. The plugin no longer starts `simplex-chat`; operators must run `simplex-chat` separately and configure `channels.openclaw-simplex.connection.wsUrl`.
- Added a migration CLI helper: `openclaw simplex migrate`.

### Changed

- Updated all documented plugin, channel, config, and pairing commands to the new `openclaw-simplex` ids.
- Kept gateway method names stable as `simplex.invite.*` for compatibility.

## [0.3.0] - 2026-04-01

### Added

- Added first-class shared `message` support for `upload-file`.
- Added plugin tools for invite and group administration:
  - `simplex_invite_create`
  - `simplex_invite_list`
  - `simplex_invite_revoke`
  - `simplex_group_add_participant`
  - `simplex_group_remove_participant`
  - `simplex_group_leave`

### Changed

- Migrated the plugin to the current OpenClaw `2026.3.28` SDK surface and raised the minimum supported OpenClaw version to `2026.3.28`.
- Expanded shared `message` action discovery so SimpleX-owned actions are declared with explicit schemas.
- Refactored the codebase into clearer domain boundaries for actions, channel runtime, gateway methods, tools, config, and SimpleX transport/services.
- Updated the operator docs to reflect the current supported invite flow:
  - direct `simplex-chat` commands for manual invite/address management
  - gateway methods and plugin tools for automation

### Fixed

- Removed duplicated SimpleX link parsing and command transport logic by centralizing shared helpers.
- Corrected stale documentation that previously implied unsupported native Control UI invite buttons.

## [0.2.1] - 2026-03-25

### Changed

- Aligned the plugin entrypoints with the current OpenClaw channel plugin structure, including a dedicated `setup-entry`.
- Updated operator documentation to reflect the current OpenClaw flow for external plugins, including trust via `plugins.allow` and explicit `channels.simplex.connection` setup.

### Fixed

- Improved SimpleX runtime status reporting so connection state, disconnects, and health are surfaced more accurately in OpenClaw.
- Fixed a runtime logger crash in the SimpleX monitor connection-status path.
- Stopped treating implicit managed defaults as a configured channel; SimpleX now requires explicit connection config before OpenClaw marks it startup-capable.
- Updated invite gateway tests to match the explicit connection-config requirement.

## [0.2.0] - 2026-03-24

### Changed

- Migrated SimpleX channel setup from the legacy onboarding adapter to the current OpenClaw setup flow.
- Updated plugin SDK integration for newer OpenClaw channel, setup, media, directory, and action APIs.
- Raised the minimum supported OpenClaw version to `2026.3.22`.

### Fixed

- Normalized SimpleX allowlist handling without relying on removed shared SDK helpers.
- Tightened config schema definitions and related tests for newer SDK expectations.

## [0.1.1] - 2026-03-02

### Added

- GitHub Actions publish workflow for npm releases.

### Fixed

- Registry authentication handling in publish workflow.

## [0.1.0] - 2026-03-02

### Added

- Initial release of `@dangoldbj/openclaw-simplex`.
- OpenClaw channel plugin registration for `simplex`.
- SimpleX runtime support via local `simplex-chat` CLI WebSocket API.
- Gateway invite methods:
  - `simplex.invite.create`
  - `simplex.invite.list`
  - `simplex.invite.revoke`
- Pairing and allowlist enforcement integration.
- Message actions support (send/reply/reaction/edit/delete + group operations).
- Managed and external connection modes.
- Operator documentation:
  - installation and setup
  - security model
  - troubleshooting
  - end-to-end getting started flow with screenshots

### Notes

- OpenClaw may warn about `child_process` usage during plugin install. This is expected for managed mode, where the plugin starts `simplex-chat` locally.
