import type { Catalog, Item } from "./types";
import { keyOf, levenshtein, tokens } from "./text";

interface Entry {
  key: string;
  toks: string[];
  itemId: string;
}

export interface MatchIndex {
  entries: Entry[];
  items: Map<string, Item>;
}

export type MatchHow = "exact" | "contained" | "contains" | "fuzzy";

export function buildIndex(catalog: Pick<Catalog, "items" | "aliases">): MatchIndex {
  const items = new Map(catalog.items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  const entries: Entry[] = [];
  const add = (itemId: string, text: string) => {
    const key = keyOf(text);
    if (!key || seen.has(`${itemId}|${key}`)) return;
    seen.add(`${itemId}|${key}`);
    entries.push({ key, toks: tokens(text), itemId });
  };
  for (const item of catalog.items) add(item.id, item.name);
  for (const a of catalog.aliases) if (items.has(a.itemId)) add(a.itemId, a.text);
  return { entries, items };
}

/** Words that may sit next to an item name without changing what it is. */
const sizeish = /^(\d+(\.\d+)?)(l|ml|cl|g|kg|pack|pk|pcs)?$|^(of|the|a|fresh|large|small|pack|bottle|tin|can|bag|box|loaf|dozen)$/;

function unique(ids: string[]): string | null {
  const set = new Set(ids);
  return set.size === 1 ? [...set][0] : null;
}

/** Returns the item a line of text means, or null when nothing fits clearly. */
export function matchItem(index: MatchIndex, name: string): { item: Item; how: MatchHow } | null {
  const key = keyOf(name);
  if (!key) return null;
  const qtoks = tokens(name);
  const get = (id: string | null, how: MatchHow) => {
    const item = id ? index.items.get(id) : undefined;
    return item ? { item, how } : null;
  };

  const exact = index.entries.filter((e) => e.key === key);
  if (exact.length) {
    const hit = get(unique(exact.map((e) => e.itemId)), "exact");
    if (hit) return hit;
  }

  // The line holds a known name plus size words, like "milk 1l".
  const inside = index.entries.filter(
    (e) => e.toks.every((t) => qtoks.includes(t)) && qtoks.filter((t) => !e.toks.includes(t)).every((t) => sizeish.test(t)),
  );
  if (inside.length) {
    const longest = Math.max(...inside.map((e) => e.toks.length));
    const hit = get(unique(inside.filter((e) => e.toks.length === longest).map((e) => e.itemId)), "contained");
    if (hit) return hit;
  }

  // The line is part of a longer known name, like "skimmed" for "semi skimmed milk".
  const outside = index.entries.filter((e) => qtoks.every((t) => e.toks.includes(t)));
  if (outside.length) {
    const hit = get(unique(outside.map((e) => e.itemId)), "contains");
    if (hit) return hit;
  }

  // A small typo.
  const limit = key.length <= 4 ? 0 : key.length <= 8 ? 1 : 2;
  if (limit > 0) {
    let best = Infinity;
    let ids: string[] = [];
    for (const e of index.entries) {
      const d = levenshtein(key, e.key);
      if (d > limit) continue;
      if (d < best) {
        best = d;
        ids = [e.itemId];
      } else if (d === best) {
        ids.push(e.itemId);
      }
    }
    if (ids.length) return get(unique(ids), "fuzzy");
  }
  return null;
}

/** Item suggestions as the user types. */
export function suggest(index: MatchIndex, query: string, limit = 8): { id: string; name: string }[] {
  const q = keyOf(query);
  const raw = query.trim().toLowerCase();
  if (!q && !raw) return [];
  const needle = q || raw;
  const best = new Map<string, number>();
  for (const e of index.entries) {
    let score = -1;
    if (e.key.startsWith(needle)) score = 0;
    else if (e.toks.some((t) => t.startsWith(needle))) score = 1;
    else if (needle.length >= 3 && e.key.includes(needle)) score = 2;
    if (score < 0) continue;
    const cur = best.get(e.itemId);
    if (cur === undefined || score < cur) best.set(e.itemId, score);
  }
  return [...best.entries()]
    .map(([id, score]) => ({ id, name: index.items.get(id)!.name, score }))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ id, name }) => ({ id, name }));
}
