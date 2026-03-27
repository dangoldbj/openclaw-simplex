# Configuration

## Top-level channel config

```json
{
  "channels": {
    "simplex": {
      "enabled": true,
      "dmPolicy": "pairing",
      "allowFrom": ["*"],
      "groupPolicy": "allowlist",
      "groupAllowFrom": [],
      "connection": {
        "mode": "managed",
        "cliPath": "simplex-chat",
        "wsHost": "127.0.0.1",
        "wsPort": 5225,
        "wsUrl": "ws://127.0.0.1:5225",
        "dataDir": "~/.simplex",
        "logCliOutput": false,
        "connectTimeoutMs": 15000
      },
      "accounts": {}
    }
  }
}
```

## Useful fields

- `enabled`: master toggle
- `dmPolicy`: `open` | `allowlist` | `pairing` | `disabled`
- `allowFrom`: DM allowlist entries
- `groupPolicy`: `open` | `allowlist` | `disabled`
- `groupAllowFrom`: group allowlist entries
- `connection.mode`: `managed` or `external`
- `connection.cliPath`: command path for managed mode
- `connection.wsUrl`: websocket URL for external mode
- `connection.logCliOutput`: opt-in raw `simplex-chat` stdout/stderr forwarding for debugging
- `accounts`: per-account overrides
