# Changelog

All notable changes to this project will be documented in this file.

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
