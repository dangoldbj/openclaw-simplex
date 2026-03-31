# Gateway Methods

The plugin registers these methods:

## `simplex.invite.create`

Create an invite link.

Request params:

```json
{
  "mode": "connect",
  "accountId": "default"
}
```

`mode` supports:

- `connect`
- `address`

## `simplex.invite.list`

List current invite/address links and pending hints.

Request params:

```json
{
  "accountId": "default"
}
```

## `simplex.invite.revoke`

Revoke active address link.

Request params:

```json
{
  "accountId": "default"
}
```

## Related Plugin Tools

The plugin also registers these tool-facing operations:

- `simplex_invite_create`
- `simplex_invite_list`
- `simplex_invite_revoke`
- `simplex_group_add_participant`
- `simplex_group_remove_participant`
- `simplex_group_leave`

These destructive tools require approval before execution:

- `simplex_invite_revoke`
- `simplex_group_remove_participant`
- `simplex_group_leave`
