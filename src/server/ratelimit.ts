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

export function clientKey(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}
