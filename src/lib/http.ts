/**
 * Shared HTTP plumbing for all providers.
 *
 * Design rules:
 * - Every error message passes through redactSecrets() before it can
 *   reach a model or a log line.
 * - Every request has a timeout. A hung SaaS API must not hang the agent.
 * - Response bodies in errors are truncated. Provider error pages can be
 *   large and an agent only needs the first lines to act.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk_(live|test)_[A-Za-z0-9]+/g, // Stripe secret keys
  /rk_(live|test)_[A-Za-z0-9]+/g, // Stripe restricted keys
  /pat-[a-z0-9-]+/gi, // HubSpot private app tokens
  /Bearer\s+[A-Za-z0-9._~+/=-]+/g, // any bearer credential
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /"private_key"\s*:\s*"[^"]*"/g,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    bodySnippet: string,
  ) {
    super(
      redactSecrets(
        `HTTP ${status} from ${url.split("?")[0]}: ${bodySnippet.slice(0, 500)}`,
      ),
    );
    this.name = "HttpError";
  }
}

export interface HttpRequest {
  method?: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  /** JSON body. Mutually exclusive with form. */
  json?: unknown;
  /** application/x-www-form-urlencoded body. */
  form?: Record<string, string>;
  timeoutMs?: number;
}

export async function httpJson<T = unknown>(req: HttpRequest): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 15000);
  try {
    const headers: Record<string, string> = { ...req.headers };
    let body: string | undefined;
    if (req.json !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(req.json);
    } else if (req.form !== undefined) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(req.form).toString();
    }
    const res = await fetch(req.url, {
      method: req.method ?? "GET",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(res.status, req.url, text);
    }
    return (text ? JSON.parse(text) : {}) as T;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactSecrets(`Request to ${req.url.split("?")[0]} failed: ${message}`));
  } finally {
    clearTimeout(timeout);
  }
}

/** Build a URL with only the defined query parameters. */
export function withQuery(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Standard MCP tool result containing pretty-printed JSON. */
export function toolJson(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/** Standard MCP tool error with redaction applied. */
export function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: redactSecrets(message) }],
  };
}

export function unixToIso(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}
