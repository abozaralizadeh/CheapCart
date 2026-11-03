import type { ParsedLine } from "./types";

/** Lower case, no accents, letters and digits only. Works for any alphabet. */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(t: string): string {
  return t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter(Boolean)
    .map(stem);
}

export function keyOf(s: string): string {
  return tokens(s).join(" ");
}

/**
 * Reads "2 milk", "2 x milk", "milk x2" or just "milk".
 * Returns null for an empty line.
 */
export function parseLine(raw: string): ParsedLine | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return null;
  let quantity = 1;
  let name = s;
  let m = s.match(/^(\d{1,2})\s*[x×]?\s+(.+)$/i);
  if (m) {
    quantity = Number(m[1]);
    name = m[2];
  } else {
    m = s.match(/^(.+?)\s*[x×]\s*(\d{1,2})$/i);
    if (m) {
      name = m[1];
      quantity = Number(m[2]);
    }
  }
  if (!Number.isInteger(quantity) || quantity < 1) quantity = 1;
  return { raw: s, name: name.trim(), quantity };
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
