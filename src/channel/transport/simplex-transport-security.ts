const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const UNSAFE_BIND_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

export type SimplexWsEndpointSecurity = {
  valid: boolean;
  redactedUrl: string;
  warnings: string[];
  blockingWarnings: string[];
};

export function redactSimplexWsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    const auth =
      url.username || url.password
        ? `${url.username ? "redacted" : ""}${url.password ? ":redacted" : ""}@`
        : "";
    const host = url.host;
    const path = url.pathname === "/" && !trimmed.includes(`${host}/`) ? "" : url.pathname;
    const query = url.search ? "?redacted" : "";
    return `${url.protocol}//${auth}${host}${path}${query}${url.hash ? "#redacted" : ""}`;
  } catch {
    return trimmed.replace(/([?&](?:token|secret|password|key|auth)=)[^&\s]+/gi, "$1redacted");
  }
}

export function isSimplexLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.trim().toLowerCase());
}

export function isSimplexUnsafeBindHost(hostname: string): boolean {
  return UNSAFE_BIND_HOSTS.has(hostname.trim().toLowerCase());
}

export function describeSimplexWsEndpointSecurity(
  rawUrl: string,
  options: { allowUnsafeRemoteWs?: boolean } = {}
): SimplexWsEndpointSecurity {
  const redactedUrl = redactSimplexWsUrl(rawUrl);
  const warnings: string[] = [];
  const blockingWarnings: string[] = [];
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch {
    const warning = `connection.wsUrl="${redactedUrl}" is not a valid URL.`;
    return {
      valid: false,
      redactedUrl,
      warnings: [warning],
      blockingWarnings: [warning],
    };
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    const warning = `connection.wsUrl="${redactedUrl}" must start with ws:// or wss://.`;
    warnings.push(warning);
    blockingWarnings.push(warning);
  }

  const hostname = parsed.hostname;
  if (isSimplexUnsafeBindHost(hostname)) {
    const warning = `connection.wsUrl="${redactedUrl}" targets ${hostname}. Bind simplex-chat to 127.0.0.1 or protect it behind a private network boundary.`;
    warnings.push(warning);
    blockingWarnings.push(warning);
  }

  const loopback = isSimplexLoopbackHost(hostname);
  if (parsed.protocol === "ws:" && !loopback) {
    const warning = `connection.wsUrl="${redactedUrl}" uses plaintext WebSocket to a non-loopback host. Prefer ws://127.0.0.1, a private sidecar network, or wss:// with network access controls.`;
    warnings.push(warning);
    if (!options.allowUnsafeRemoteWs) {
      blockingWarnings.push(
        `${warning} Set connection.allowUnsafeRemoteWs=true only when this endpoint is protected by a private network, firewall, or authenticated TLS proxy.`
      );
    }
  }

  return { valid: blockingWarnings.length === 0, redactedUrl, warnings, blockingWarnings };
}

export function assertSimplexWsEndpointAllowed(params: {
  wsUrl: string;
  allowUnsafeRemoteWs?: boolean;
}): void {
  const security = describeSimplexWsEndpointSecurity(params.wsUrl, {
    allowUnsafeRemoteWs: params.allowUnsafeRemoteWs,
  });
  if (security.blockingWarnings.length > 0) {
    throw new Error(`Unsafe SimpleX WebSocket endpoint: ${security.blockingWarnings.join(" ")}`);
  }
}
