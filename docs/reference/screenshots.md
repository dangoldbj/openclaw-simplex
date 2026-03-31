# Screenshots

This page shows the supported SimpleX pairing and approval flow.

Generate or retrieve the invite/address link through `simplex.invite.create` or `simplex.invite.list`, then continue with the pairing flow below.

It assumes the SimpleX channel is already configured, for example with a managed `channels.simplex.connection` setup.

## Pairing flow

1. Send first message from the SimpleX app and capture pairing request:

![Pairing code shown in SimpleX app](/images/pairing-request.png)

Pairing request table in OpenClaw:

![OpenClaw pairing requests table](/images/pairing-list.png)

2. Approve pairing in OpenClaw:

```bash
openclaw pairing list
```

```bash
openclaw pairing approve simplex <code>
```

3. Confirm approved + first successful chat:

![SimpleX access approved message](/images/approved.png)

![SimpleX chat after approval](/images/chat.png)
