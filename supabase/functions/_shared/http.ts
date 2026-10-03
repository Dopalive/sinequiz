import { ERROR_STATUS, type ErrorCode } from "./shared/errors.ts";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message?: string) {
    super(message ?? code);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
}

/** Parses the body as a JSON object; anything else (invalid JSON, null, array, scalar) is bad_request. */
export async function readJson<T>(req: Request): Promise<T> {
  let value: unknown;
  try {
    value = await req.json();
  } catch {
    throw new AppError("bad_request", "invalid JSON body");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("bad_request", "body must be a JSON object");
  }
  return value as T;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns `value` if it is a uuid string; otherwise throws bad_request naming `field`. */
export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AppError("bad_request", `${field} must be a uuid`);
  }
  return value;
}

export function handle(fn: (req: Request) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof AppError) {
        return json({ error: err.code, message: err.message }, ERROR_STATUS[err.code]);
      }
      console.error(err);
      return json({ error: "internal" }, 500);
    }
  };
}
