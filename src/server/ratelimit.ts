/** Fixed window limiter kept in memory. Good enough for one VM. */
const hits = new Map<string, { count: number; resetAt: number }>();

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const cur = hits.get(key);
  if (!cur || now >= cur.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    return true;
  }
  cur.count++;
  return cur.count <= limit;
}

export function resetRateLimits(): void {
  hits.clear();
}

/**
 * Who a request is from, for rate limits. x-forwarded-for is only believed when TRUST_PROXY is set
 * (for example to 127.0.0.1 when nginx on the same machine sets it). Without it anyone could send a
 * made-up header to dodge the limits, so every request shares one key.
 */
export function clientKey(headers: Headers, trustProxy = process.env.TRUST_PROXY ?? ""): string {
  if (!trustProxy || trustProxy === "false" || trustProxy === "0") return "direct";
  const hops = (headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  // The last hop is the one our own proxy added, so a client can't fake it.
  return hops.at(-1) || "direct";
}
