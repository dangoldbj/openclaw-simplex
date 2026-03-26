# Screenshots

This page shows the SimpleX invite flow in OpenClaw Control UI.

It assumes the SimpleX channel is already configured, for example with a managed `channels.simplex.connection` setup.

## Control UI invite flow

1. Open `Control -> Channels -> SimpleX`.

Before invite generation:

![SimpleX channel card before invite generation](/images/control-ui.png)

2. Click `Create 1-time Link`.

After link generation:

![SimpleX one-time link generated in Control UI](/images/1-time-link-generation.png)

3. Send first message from the SimpleX app and capture pairing request:

![Pairing code shown in SimpleX app](/images/pairing-request.png)

Pairing request table in OpenClaw:

![OpenClaw pairing requests table](/images/pairing-list.png)

4. Approve pairing in OpenClaw:

```bash
openclaw pairing list
```

```bash
openclaw pairing approve simplex <code>
```

5. Confirm approved + first successful chat:

![SimpleX access approved message](/images/approved.png)

![SimpleX chat after approval](/images/chat.png)
