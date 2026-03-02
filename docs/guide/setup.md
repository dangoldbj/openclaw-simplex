# Setup

Prerequisite: install `simplex-chat` first (see [Getting Started](/guide/getting-started)).

## Managed mode

Use when OpenClaw should start and manage `simplex-chat`.

```json
{
  "channels": {
    "simplex": {
      "connection": {
        "mode": "managed",
        "cliPath": "simplex-chat",
        "wsHost": "127.0.0.1",
        "wsPort": 5225
      }
    }
  }
}
```

## External mode

Use when SimpleX WS is already running outside OpenClaw.

```json
{
  "channels": {
    "simplex": {
      "connection": {
        "mode": "external",
        "wsUrl": "ws://127.0.0.1:5225"
      }
    }
  }
}
```

## Per-account config

```json
{
  "channels": {
    "simplex": {
      "accounts": {
        "ops": {
          "enabled": true,
          "connection": {
            "mode": "external",
            "wsUrl": "ws://127.0.0.1:7777"
          }
        }
      }
    }
  }
}
```
