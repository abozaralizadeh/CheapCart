import { NextResponse } from "next/server";
import { loadConfig } from "../lib/config";
import { allow, clientKey } from "./ratelimit";
import type { Reply } from "./handlers";

export function reply(r: Reply): NextResponse {
  return NextResponse.json(r.body, { status: r.status });
}

const MAX_JSON_BYTES = 100_000;
const MAX_UPLOAD_BYTES = 2_500_000;

/** Returns a 429 reply when the client is over the limit, or a 413 when the body is too big, otherwise null. */
export function limited(req: Request, scope: "general" | "submit"): NextResponse | null {
  const cfg = loadConfig();
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > (scope === "submit" ? MAX_UPLOAD_BYTES : MAX_JSON_BYTES)) {
    return NextResponse.json({ error: "too_big", message: "That request is too big." }, { status: 413 });
  }
  const key = `${scope}:${clientKey(req.headers)}`;
  const ok =
    scope === "submit"
      ? allow(key, cfg.submitRateLimitPerHour, 3_600_000)
      : allow(key, cfg.rateLimitPerMin, 60_000);
  return ok ? null : NextResponse.json({ error: "rate_limited", message: "Too many requests. Try again in a bit." }, { status: 429 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    const text = await req.text();
    if (text.length > MAX_JSON_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}
