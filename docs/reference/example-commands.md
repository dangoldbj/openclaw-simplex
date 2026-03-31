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

Trust plugin:

```bash
openclaw config set plugins.allow "$(
  (openclaw config get plugins.allow --json 2>/dev/null || echo '[]') \
  | jq -c '. + ["simplex"] | unique'
)" --strict-json
```

Configure managed mode:

```bash
openclaw channels add --channel simplex --cli-path simplex-chat
```

Verify:

```bash
openclaw plugins list
openclaw plugins info simplex
```

## SimpleX CLI invite commands

Run these inside the `simplex-chat` console:

```text
/c
/ad
/show_address
/delete_address
```

## Gateway method examples

Use your normal gateway client when you want the same invite flow programmatically:

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
