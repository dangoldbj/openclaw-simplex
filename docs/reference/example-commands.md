# Example Commands

## Plugin lifecycle

Package install (pick one):

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

OpenClaw plugin setup:

Install plugin in OpenClaw:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
```

Enable plugin:

```bash
openclaw plugins enable simplex
```

Verify:

```bash
openclaw plugins list
openclaw plugins info simplex
```

## Gateway method examples

Use your normal gateway client to call:

- `simplex.invite.create`
- `simplex.invite.list`
- `simplex.invite.revoke`

Example payloads:

```json
{
  "mode": "connect",
  "accountId": "default"
}
```

```json
{
  "accountId": "default"
}
```
