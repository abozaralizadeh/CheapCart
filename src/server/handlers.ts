import type { Config } from "../lib/config";
import { loadConfig } from "../lib/config";
import { compare } from "../lib/compare";
import { areaCovers, findAreaForPoint, findPostcode } from "../lib/geo";
import { suggest } from "../lib/matching";
import { getReader, isSensitive, matchReceiptLine, ReaderError, type ReceiptReader } from "../lib/receipts";
import { getContext } from "../lib/store";
import { daysBetween, toIsoDate } from "../lib/validate";
import { normalize } from "../lib/text";
import { log } from "./logger";
import { logUnmatched } from "./unmatched";
import { reportWrongPrice, submitPrices } from "./submissions";

export interface Reply {
  status: number;
  body: Record<string, unknown>;
}

const bad = (message: string, status = 400): Reply => ({ status, body: { error: "bad_request", message } });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function configHandler(cfg: Config = loadConfig()): Reply {
  const { areas } = getContext(cfg);
  return {
    status: 200,
    body: {
      areas: areas.map((a) => ({ id: a.id, name: a.name, sample: a.sample, postcodes: a.postcodes.map((p) => p.code) })),
      sample: areas.some((a) => a.sample),
      defaultRadiusKm: cfg.defaultRadiusKm,
      minRadiusKm: cfg.minRadiusKm,
      maxRadiusKm: cfg.maxRadiusKm,
      freshnessDays: cfg.freshnessDays,
      currency: cfg.currency,
      maxListLines: cfg.maxListLines,
      maxLineLength: cfg.maxLineLength,
    },
  };
}

export function itemsHandler(q: string, cfg: Config = loadConfig()): Reply {
  const { index } = getContext(cfg);
  return { status: 200, body: { suggestions: suggest(index, q.slice(0, cfg.maxLineLength)) } };
}

export function areaHandler(body: unknown, cfg: Config = loadConfig()): Reply {
  if (!isObj(body)) return bad("Send a postcode or a location.");
  const { areas } = getContext(cfg);
  const notCovered: Reply = {
    status: 404,
    body: { error: "not_covered", message: "CheapCart is not available there yet." },
  };
  if (typeof body.postcode === "string") {
    const hit = findPostcode(areas, body.postcode.slice(0, 20));
    if (!hit) return notCovered;
    return { status: 200, body: { area: { id: hit.area.id, name: hit.area.name, sample: hit.area.sample }, point: hit.point } };
  }
  if (isNum(body.lat) && isNum(body.lng) && Math.abs(body.lat) <= 90 && Math.abs(body.lng) <= 180) {
    const point = { lat: round3(body.lat), lng: round3(body.lng) };
    const area = findAreaForPoint(areas, point);
    if (!area) return notCovered;
    return { status: 200, body: { area: { id: area.id, name: area.name, sample: area.sample }, point } };
  }
  return bad("Send a postcode or a location.");
}

export function compareHandler(body: unknown, cfg: Config = loadConfig(), now = new Date()): Reply {
  if (!isObj(body)) return bad("Send a list and a location.");
  const { lines, lat, lng, areaId } = body;
  if (!Array.isArray(lines) || lines.length === 0) return bad("Add at least one item to the list.");
  if (lines.length > cfg.maxListLines) return bad(`A list can have up to ${cfg.maxListLines} lines.`);
  if (!lines.every((l) => typeof l === "string" && l.length <= cfg.maxLineLength)) {
    return bad(`Each line must be text of up to ${cfg.maxLineLength} characters.`);
  }
  if (!isNum(lat) || !isNum(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return bad("Set your location first.");
  if (typeof areaId !== "string") return bad("Set your location first.");
  const radius = isNum(body.radiusKm) ? body.radiusKm : cfg.defaultRadiusKm;
  const radiusKm = Math.min(cfg.maxRadiusKm, Math.max(cfg.minRadiusKm, radius));

  const ctx = getContext(cfg);
  const area = ctx.areas.find((a) => a.id === areaId);
  if (!area || !areaCovers(area, { lat, lng })) {
    return { status: 422, body: { error: "not_covered", message: "CheapCart is not available there yet." } };
  }
  const result = compare(
    ctx.catalog,
    ctx.index,
    { lines: lines as string[], origin: { lat, lng }, radiusKm, areaId: area.id, now },
    { freshnessDays: cfg.freshnessDays, currency: cfg.currency },
  );
  const missing = result.lines.filter((l) => l.status === "not_found").map((l) => l.raw);
  if (missing.length) {
    try {
      logUnmatched(cfg, missing, now);
    } catch (e) {
      log("warn", "unmatched_write_failed", { error: String(e).slice(0, 100) });
    }
  }
  log("info", "compare", {
    lines: result.lines.length,
    priced: result.summary.pricedCount,
    unmatched: missing.length,
    shopsInRange: result.meta.shopsInRange,
  });
  return { status: 200, body: result as unknown as Record<string, unknown> };
}

export async function receiptReadHandler(
  input: { bytes: Uint8Array; mime: string },
  areaId: string | undefined,
  cfg: Config = loadConfig(),
  reader?: ReceiptReader,
): Promise<Reply> {
  if (input.bytes.length === 0) return bad("The file is empty.");
  if (input.bytes.length > 2_000_000) return bad("The file is too big. The limit is 2 MB.", 413);
  const ctx = getContext(cfg);
  let reading;
  try {
    reading = await (reader ?? getReader(cfg)).read(input);
  } catch (e) {
    if (e instanceof ReaderError) return { status: 501, body: { error: "reader_unavailable", message: e.message } };
    log("error", "reader_failed", { error: String(e).slice(0, 100) });
    return { status: 500, body: { error: "reader_failed", message: "Could not read that file." } };
  }
  const shops = ctx.catalog.shops.filter((s) => s.active && (!areaId || s.area === areaId));
  const want = reading.shopName ? normalize(reading.shopName) : "";
  const guess = want ? shops.find((s) => normalize(s.chain) && want.includes(normalize(s.chain))) : undefined;
  return {
    status: 200,
    body: {
      shopId: guess?.id ?? null,
      date: reading.date ?? toIsoDate(new Date()),
      // Whatever the reader returns, lines with personal details never go further.
      lines: reading.lines.filter((l) => !isSensitive(l.text)).map((l) => matchReceiptLine(ctx.catalog, ctx.index, l)),
      shops: shops.map((s) => ({ id: s.id, name: s.name, address: s.address })),
    },
  };
}

export function submissionConfirmHandler(body: unknown, cfg: Config = loadConfig(), now = new Date()): Reply {
  if (!isObj(body) || typeof body.shopId !== "string" || typeof body.date !== "string" || !Array.isArray(body.lines)) {
    return bad("Send a shop, a date and some lines.");
  }
  if (body.lines.length === 0 || body.lines.length > 60) return bad("Send between 1 and 60 lines.");
  const lines = [];
  for (const l of body.lines) {
    if (!isObj(l) || typeof l.text !== "string" || !isNum(l.amountMinor)) return bad("Each line needs text and a price.");
    lines.push({ text: l.text, amountMinor: l.amountMinor, productId: typeof l.productId === "string" ? l.productId : undefined });
  }
  const { catalog } = getContext(cfg);
  const outcomes = submitPrices(cfg, catalog, { shopId: body.shopId, date: body.date, lines }, now);
  const count = (s: string) => outcomes.filter((o) => o.status === s).length;
  log("info", "submission", { accepted: count("accepted"), pending: count("pending"), rejected: count("rejected") });
  return {
    status: 200,
    body: { outcomes, accepted: count("accepted"), pending: count("pending"), rejected: count("rejected") },
  };
}

export function reportHandler(body: unknown, cfg: Config = loadConfig(), now = new Date()): Reply {
  if (!isObj(body) || typeof body.shopId !== "string" || typeof body.productId !== "string") return bad("Send a shop and a product.");
  const { catalog } = getContext(cfg);
  if (!catalog.shops.some((s) => s.id === body.shopId) || !catalog.products.some((p) => p.id === body.productId)) {
    return bad("Unknown shop or product.");
  }
  reportWrongPrice(cfg, body.shopId, body.productId, typeof body.note === "string" ? body.note : "", now);
  log("info", "price_report", {});
  return { status: 200, body: { ok: true } };
}

export function healthHandler(cfg: Config = loadConfig(), now = new Date()): Reply {
  try {
    const { catalog, areas } = getContext(cfg);
    const newest = catalog.prices.reduce((m, p) => (p.seenOn > m ? p.seenOn : m), "");
    return {
      status: 200,
      body: {
        ok: true,
        areas: areas.length,
        shops: catalog.shops.length,
        items: catalog.items.length,
        prices: catalog.prices.length,
        newestPrice: newest || null,
        newestPriceAgeDays: newest ? daysBetween(newest, now) : null,
        pricesStale: !newest || daysBetween(newest, now) > cfg.freshnessDays,
      },
    };
  } catch (e) {
    log("error", "health_failed", { error: String(e).slice(0, 150) });
    return { status: 503, body: { ok: false, message: "Data could not be loaded." } };
  }
}
