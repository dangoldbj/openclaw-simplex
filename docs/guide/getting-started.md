# Getting Started

## 1. Install package

`npm`

```bash
npm i @dangoldbj/openclaw-simplex
```

`pnpm`

```bash
pnpm add @dangoldbj/openclaw-simplex
```

`yarn`

```bash
yarn add @dangoldbj/openclaw-simplex
```

## 2. Register with OpenClaw

Install plugin in OpenClaw:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
```

Enable plugin:

```bash
openclaw plugins enable simplex
```

## 3. Configure channel

```json
{
  "channels": {
    "simplex": {
      "enabled": true,
      "connection": {
        "mode": "managed",
        "cliPath": "simplex-chat"
      },
      "dmPolicy": "pairing",
      "allowFrom": []
    }
  }
}
```

## 4. Restart OpenClaw

Restart OpenClaw so plugin/channel registry reloads.

## 5. Verify

```bash
openclaw plugins list
openclaw plugins info simplex
```
