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
      "allowFrom": ["*"]
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

In Control UI, open `Control -> Channels -> SimpleX`:

![SimpleX channel card before invite generation](/images/control-ui.png)

## 6. Create a 1-time link

Click `Create 1-time Link`, then copy the link or scan the QR.

![SimpleX one-time link generated in Control UI](/images/1-time-link-generation.png)

## 7. Pair in the SimpleX app

Open the SimpleX app and scan the QR (or open the copied link).

## 8. Send first message and receive pairing code

Send a message from the SimpleX app to the OpenClaw contact.  
OpenClaw creates a pairing request and returns an approval code.

![Pairing code shown in SimpleX app](/images/pairing-request.png)

## 9. Approve in OpenClaw

List pairing requests and get the code:

```bash
pnpm openclaw pairing list
```

Pairing request table in OpenClaw:

![OpenClaw pairing requests table](/images/pairing-list.png)

Approve the pairing request:

```bash
openclaw pairing approve simplex <code>
```

SimpleX app shows approval confirmation:

![SimpleX access approved message](/images/approved.png)

## 10. Confirm and chat

After approval, send a new message from the SimpleX app.  
OpenClaw should now accept and process messages from that contact.

![SimpleX chat after approval](/images/chat.png)

More screenshots: [Screenshots](/reference/screenshots)
