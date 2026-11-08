/**
 * Shared HTTP plumbing for the AI routes: one in-memory rate limiter shared
 * by all /api/* routes (the free OpenAI budget is 10 req/min per val, not per
 * route), client-IP extraction, safe JSON parsing, and JSON error replies
 * that never leak internals.
 */
import { createRateLimiter, type RateLimiter } from "./ratelimit.ts";

/** 10 requests/minute per IP across all AI routes (Val Town free-OpenAI budget). */
export const apiLimiter: RateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

/** Best-effort client IP behind the val's proxy; "unknown" when unavailable. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export function jsonError(status: number, msg: string): Response {
  return jsonResponse({ error: msg }, status);
}

/** Parse a JSON request body; null on non-JSON, non-object, or >32 KB. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > 32_768) return null;
    const v = JSON.parse(text);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
    return v as Record<string, unknown>;
  } catch {
    return null;
  }
}
