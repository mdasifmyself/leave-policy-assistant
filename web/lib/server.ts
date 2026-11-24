// Server-only helpers: settings, signing and a simple rate limit.
import { createHmac, timingSafeEqual } from "node:crypto";

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing setting ${name}`);
  return v;
}

// Each checked answer is signed here. The voice route only speaks text with a
// valid signature, so unchecked text can never be read aloud, and the page
// can't be used as a free text-to-speech service.
export function sign(text: string): string {
  return createHmac("sha256", env("SIGNING_SECRET")).update(text).digest("base64url");
}

export function verify(text: string, sig: string): boolean {
  const a = Buffer.from(sign(text));
  const b = Buffer.from(String(sig || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Per-visitor limits. In memory, so each server instance counts on its own:
// it stops casual abuse; the hard safety net is the spending cap at each provider.
const hits = new Map<string, number[]>();
export function limited(req: Request, bucket: string, perMinute: number, perDay: number): boolean {
  const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 86_400_000);
  const lastMinute = list.filter((t) => now - t < 60_000).length;
  if (lastMinute >= perMinute || list.length >= perDay) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  return false;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
