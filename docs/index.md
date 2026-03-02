# OpenClaw SimpleX

SimpleX channel plugin for OpenClaw.

## Why this plugin

This plugin brings OpenClaw to SimpleX with clear policy controls, multi-account support, and operational flexibility (`managed` or `external` runtime).

## Install

Required runtime (`simplex-chat` CLI):

Official installer:

```bash
curl -o- https://raw.githubusercontent.com/simplex-chat/simplex-chat/stable/install.sh | bash
```

If the official installer resolves the wrong Darwin/Linux target on your host, use this temporary arch-matrix installer:

```bash
curl -o- https://raw.githubusercontent.com/dangoldbj/simplex-chat/install-arch-matrix/install.sh | bash
```

Package:

`pnpm`

```bash
pnpm add @dangoldbj/openclaw-simplex
```

`npm`

```bash
npm i @dangoldbj/openclaw-simplex
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

## Start Here

- [Why SimpleX](/guide/why-simplex)
- [Getting Started](/guide/getting-started)
- [How It Works](/guide/how-it-works)
- [Architecture](/guide/architecture)
- [External vs Managed](/guide/external-vs-managed)
- [Security Model](/guide/security-model)
- [Troubleshooting](/guide/troubleshooting)

## Reference

- [Configuration](/reference/config)
- [Gateway Methods](/reference/gateway-methods)
- [Example Commands](/reference/example-commands)
- [Screenshots](/reference/screenshots)
