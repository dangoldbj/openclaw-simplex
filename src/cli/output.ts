/**
 * CLI output formatting.
 *
 * Every SimpleX command used to print raw JSON, which is right for pipelines
 * and wrong for a person reading `runtime doctor` in a terminal. Output mode is
 * therefore chosen by destination: a TTY gets a readable summary, anything
 * redirected or piped keeps emitting exactly the JSON it emitted before, so
 * existing scripts are unaffected. `--json` forces JSON in a TTY.
 */

export type OutputCliOptions = {
  json?: boolean;
};

export function shouldEmitJson(
  opts: OutputCliOptions,
  isTty: boolean | undefined = process.stdout.isTTY
): boolean {
  return opts.json === true || !isTty;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

/**
 * Sentence case, not title case: `wsUrl` reads as "Ws url" rather than the
 * noisier "Ws Url", and every label then looks the same regardless of how many
 * words the key splits into.
 */
function labelFor(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Generic renderer used by every command that has no bespoke formatter, so the
 * whole surface reads consistently without hand-writing thirty of them.
 */
export function formatHuman(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${pad}(none)`;
    }
    return value
      .map((entry) =>
        isPlainObject(entry) || Array.isArray(entry)
          ? `${pad}-\n${formatHuman(entry, indent + 1)}`
          : `${pad}- ${formatScalar(entry)}`
      )
      .join("\n");
  }

  if (!isPlainObject(value)) {
    return `${pad}${formatScalar(value)}`;
  }

  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  if (entries.length === 0) {
    return `${pad}(empty)`;
  }

  return entries
    .map(([key, entryValue]) => {
      if (isPlainObject(entryValue) || Array.isArray(entryValue)) {
        const nested = formatHuman(entryValue, indent + 1);
        return `${pad}${labelFor(key)}:\n${nested}`;
      }
      return `${pad}${labelFor(key)}: ${formatScalar(entryValue)}`;
    })
    .join("\n");
}

type DoctorLike = {
  ok: boolean;
  issues: string[];
  accountId: string;
  wsUrl: string | null;
  runtimeVersion: string | null;
};

/**
 * The doctor's whole point is the verdict, which a raw dump buries. `ok` also
 * drives the process exit code, so the summary states it plainly.
 */
export function formatRuntimeDoctor(result: DoctorLike): string {
  const header = [
    `Account:  ${result.accountId}`,
    `Endpoint: ${result.wsUrl ?? "-"}`,
    `Runtime:  ${result.runtimeVersion ?? "unknown"}`,
  ].join("\n");

  if (result.ok) {
    return `${header}\n\nSimpleX runtime looks healthy.`;
  }

  const issues = result.issues.map((issue) => `  - ${issue}`).join("\n");
  const count = result.issues.length;
  return `${header}\n\nFound ${count} issue${count === 1 ? "" : "s"}:\n${issues}`;
}

export function emit<T>(value: T, opts: OutputCliOptions, formatter?: (value: T) => string): void {
  if (shouldEmitJson(opts)) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(formatter ? formatter(value) : formatHuman(value));
}
