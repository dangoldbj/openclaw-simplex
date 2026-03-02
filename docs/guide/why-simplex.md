# Why SimpleX

SimpleX is useful when you want a messaging channel with strong privacy posture and flexible deployment choices.

## What this plugin provides

SimpleX messaging channel backed by the local `simplex-chat` CLI. It supports:

- send/receive (text and media)
- pairing with allowlist enforcement
- message actions
- invite link and QR generation
- onboarding/status support
- Control UI configuration parity

## Why teams choose it

- Privacy-oriented protocol and ecosystem.
- Good fit for operators who want tighter control over runtime/network boundaries.
- Works well with OpenClaw policy controls (`allowFrom`, `dmPolicy`, group policy).
- Lets you avoid provider lock-in from mainstream chat APIs.

## Why this plugin matters

Without this plugin, using SimpleX with OpenClaw usually means custom integration work. This package gives a standardized channel implementation with status, outbound/inbound handling, directory integration, and invite helpers.

It also addresses practical gaps in the current channel mix:

- no phone number requirement
- no third-party bot API dependency
- avoids reliance on unofficial CLIs

## Risk profile

Low risk to existing channels: implementation is isolated and only active when `simplex` is configured/enabled.
