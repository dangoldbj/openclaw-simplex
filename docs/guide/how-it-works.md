# How It Works

## Flow

1. OpenClaw loads the SimpleX channel plugin and registers channel id `simplex`.
   For disabled or unconfigured channels, OpenClaw can use the lightweight setup entry before loading the full runtime entry.
2. Channel runtime connects to SimpleX over CLI WebSocket API.
3. Inbound events are normalized into OpenClaw context.
4. Policy checks run (`dmPolicy`, `allowFrom`, group policy).
5. OpenClaw sends replies/actions back through SimpleX.

## Runtime features

- Channel status snapshots and runtime health.
- Account-level resolution and default-account behavior.
- Message actions (send, react, edit, delete, group operations).
- Directory/resolver support for peers/groups/members.
- Gateway invite helper methods for operational setup.
