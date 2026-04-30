import { describe, expect, it } from "vitest";
import {
  describeSimplexWsEndpointSecurity,
  redactSimplexWsUrl,
} from "./simplex-transport-security.js";

describe("simplex transport security", () => {
  it("accepts loopback websocket URLs", () => {
    expect(describeSimplexWsEndpointSecurity("ws://127.0.0.1:5225")).toMatchObject({
      valid: true,
      warnings: [],
    });
    expect(describeSimplexWsEndpointSecurity("ws://localhost:5225")).toMatchObject({
      valid: true,
      warnings: [],
    });
  });

  it("warns on plaintext non-loopback and wildcard endpoints", () => {
    const lan = describeSimplexWsEndpointSecurity("ws://192.168.1.10:5225");
    expect(lan.valid).toBe(false);
    expect(lan.warnings.join("\n")).toContain("plaintext WebSocket to a non-loopback host");
    expect(lan.blockingWarnings.join("\n")).toContain("allowUnsafeRemoteWs");

    const wildcard = describeSimplexWsEndpointSecurity("ws://0.0.0.0:5225");
    expect(wildcard.valid).toBe(false);
    expect(wildcard.warnings.join("\n")).toContain("targets 0.0.0.0");
  });

  it("allows private sidecar hostnames only with the explicit unsafe override", () => {
    const blocked = describeSimplexWsEndpointSecurity("ws://simplex-chat:5225");
    expect(blocked.valid).toBe(false);
    expect(blocked.blockingWarnings.join("\n")).toContain("allowUnsafeRemoteWs");

    const allowed = describeSimplexWsEndpointSecurity("ws://simplex-chat:5225", {
      allowUnsafeRemoteWs: true,
    });
    expect(allowed.valid).toBe(true);
    expect(allowed.warnings.join("\n")).toContain("non-loopback host");
    expect(allowed.blockingWarnings).toEqual([]);
  });

  it("redacts query strings and URL credentials", () => {
    expect(redactSimplexWsUrl("ws://user:pass@127.0.0.1:5225/?token=secret")).toBe(
      "ws://redacted:redacted@127.0.0.1:5225/?redacted"
    );
    expect(describeSimplexWsEndpointSecurity("ws://127.0.0.1:5225/?token=secret").redactedUrl).toBe(
      "ws://127.0.0.1:5225/?redacted"
    );
    expect(redactSimplexWsUrl("ws://[::1]:5225/?token=secret")).toBe("ws://[::1]:5225/?redacted");
  });
});
