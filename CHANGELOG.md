# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- Raised the minimum supported OpenClaw version to `2026.4.23` and aligned the package metadata/tests with the newer host release.
- Switched terminal QR rendering to OpenClaw's shared QR helper so plugin CLI output follows the current bounded host-side QR path used by newer OpenClaw releases.

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
