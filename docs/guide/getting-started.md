# Getting Started

## 1. Install SimpleX CLI (required)

Official installer:

```bash
curl -o- https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash
```

If the official installer resolves the wrong Darwin/Linux target on your host, use this temporary arch-matrix installer:

```bash
curl -o- https://raw.githubusercontent.com/dangoldbj/simplex-chat/install-arch-matrix/install.sh | bash
```

Verify CLI is available:

```bash
simplex-chat -h
```

## 2. Install package

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

## 3. Register with OpenClaw

Install plugin in OpenClaw:

```bash
openclaw plugins install @dangoldbj/openclaw-simplex
```

Enable plugin:

```bash
openclaw plugins enable simplex
```

Trust the plugin explicitly:

```bash
openclaw config set plugins.allow '["simplex"]' --strict-json
```

If you already trust other external plugins, include them too. For example:

```bash
openclaw config set plugins.allow '["duckduckgo","simplex"]' --strict-json
```

`plugins enable simplex` only enables the plugin. OpenClaw will not start the SimpleX runtime until `channels.simplex.connection` is configured.

## 4. Configure channel

Managed mode via CLI:

```bash
openclaw channels add --channel simplex --cli-path simplex-chat
```

Or write config directly:

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

## 5. Restart OpenClaw

Restart OpenClaw so plugin/channel registry reloads.

## 6. Verify

```bash
openclaw plugins list
openclaw plugins info simplex
```

In Control UI, open `Control -> Channels -> SimpleX`:

Note: the current SimpleX card is a config editor. For this external plugin, the interactive `openclaw channels add` picker may not list SimpleX yet.

![SimpleX channel card before invite generation](/images/control-ui.png)

## 7. Create a 1-time link

Click `Create 1-time Link`, then copy the link or scan the QR.

![SimpleX one-time link generated in Control UI](/images/1-time-link-generation.png)

## 8. Pair in the SimpleX app

Open the SimpleX app and scan the QR (or open the copied link).

## 9. Send first message and receive pairing code

Send a message from the SimpleX app to the OpenClaw contact.  
OpenClaw creates a pairing request and returns an approval code.

![Pairing code shown in SimpleX app](/images/pairing-request.png)

## 10. Approve in OpenClaw

List pairing requests and get the code:

```bash
openclaw pairing list
```

Pairing request table in OpenClaw:

![OpenClaw pairing requests table](/images/pairing-list.png)

Approve the pairing request:

```bash
openclaw pairing approve simplex <code>
```

SimpleX app shows approval confirmation:

![SimpleX access approved message](/images/approved.png)

## 11. Confirm and chat

After approval, send a new message from the SimpleX app.  
OpenClaw should now accept and process messages from that contact.

![SimpleX chat after approval](/images/chat.png)

More screenshots: [Screenshots](/reference/screenshots)
