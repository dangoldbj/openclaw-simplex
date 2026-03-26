# Troubleshooting

## Plugin not listed

- Run `openclaw plugins list`
- Verify `plugins.allow` includes `simplex`
- Verify package installed in the same runtime environment as OpenClaw
- Restart OpenClaw

## Channel fails to start

- Check `channels.simplex.connection`
- Validate `connection` values (`mode`, `cliPath`, `wsUrl`, `wsHost/wsPort`)
- In managed mode, verify `simplex-chat` is executable from PATH

## Inbound messages dropped

- Review `dmPolicy`, `allowFrom`, `groupPolicy`, `groupAllowFrom`
- In pairing mode, approve pending senders

## Invite methods failing

- Ensure channel account is configured and enabled
- Verify WS connectivity to SimpleX endpoint
- Check runtime status for last error

## Media issues

- Ensure media URLs are reachable by OpenClaw host
- Check configured max media size (`mediaMaxMb`)
- Confirm MIME/file handling on source side

## Useful diagnostic commands

```bash
openclaw plugins list
openclaw plugins info simplex
openclaw channels add --channel simplex --cli-path simplex-chat
```
