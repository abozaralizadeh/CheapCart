import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { generateSample } from "../src/lib/sample";
import {
  areaHandler,
  compareHandler,
  configHandler,
  healthHandler,
  itemsHandler,
  receiptReadHandler,
  reportHandler,
  submissionConfirmHandler,
} from "../src/server/handlers";
import { readCatalog } from "../src/lib/store";
import { unmatchedReport } from "../src/server/unmatched";
import { tmpConfig } from "./helpers";

type Cfg = ReturnType<typeof tmpConfig>["cfg"];
let cfg: Cfg;
const ST1 = { lat: 10.0, lng: -30.0 };

beforeEach(() => {
  cfg = tmpConfig().cfg;
  generateSample(cfg.dataDir, new Date());
});

const body = (r: { body: Record<string, unknown> }) => r.body as any;

describe("config and items", () => {
  it("lists the areas and the settings the page needs", () => {
    const r = body(configHandler(cfg));
    expect(r.areas.map((a: any) => a.id)).toEqual(["sample-town", "sample-village"]);
    expect(r.sample).toBe(true);
    expect(r.defaultRadiusKm).toBe(3);
  });
  it("suggests items", () => {
    const r = body(itemsHandler("mil", cfg));
    expect(r.suggestions[0].name).toBe("Milk");
  });
  it("can limit the launch area by setting", () => {
    const only = { ...cfg, launchAreas: ["sample-village"] };
    expect(body(configHandler(only)).areas.map((a: any) => a.id)).toEqual(["sample-village"]);
  });
});

describe("area", () => {
  it("finds a postcode in any spelling", () => {
    const r = areaHandler({ postcode: " st 1 " }, cfg);
    expect(r.status).toBe(200);
    expect(body(r).area.id).toBe("sample-town");
    expect(body(r).point).toEqual(ST1);
  });
  it("says so when a place is not covered", () => {
    expect(areaHandler({ postcode: "ZZ9" }, cfg).status).toBe(404);
    expect(areaHandler({ lat: 50, lng: 50 }, cfg).status).toBe(404);
  });
  it("rounds a device location to about 100 m", () => {
    const r = body(areaHandler({ lat: 10.00049, lng: -30.00051 }, cfg));
    expect(r.point).toEqual({ lat: 10.0, lng: -30.001 });
  });
  it("rejects nonsense", () => {
    expect(areaHandler(null, cfg).status).toBe(400);
    expect(areaHandler({ lat: "x", lng: 1 }, cfg).status).toBe(400);
  });
});

describe("compare", () => {
  const good = { lines: ["milk", "2 eggs", "bread", "butter", "unicorn dust"], ...ST1, areaId: "sample-town", radiusKm: 3 };

  it("answers a real list from the sample data", () => {
    const r = compareHandler(good, cfg);
    expect(r.status).toBe(200);
    const b = body(r);
    expect(b.summary.pricedCount).toBeGreaterThanOrEqual(3);
    expect(b.summary.sample).toBe(true);
    const bad = b.lines.find((l: any) => l.raw === "unicorn dust");
    expect(bad.status).toBe("not_found");
    for (const l of b.lines.filter((x: any) => x.status === "ok")) {
      expect(l.best.ageDays).toBeLessThanOrEqual(cfg.freshnessDays);
      expect(l.best.distanceKm).toBeLessThanOrEqual(3);
    }
  });

  it("saves the text of unmatched lines, without a location", () => {
    compareHandler(good, cfg);
    const rows = unmatchedReport(cfg);
    expect(rows).toEqual([{ text: "unicorn dust", count: 1 }]);
    const raw = fs.readFileSync(path.join(cfg.runtimeDir, "unmatched.csv"), "utf8");
    expect(raw).not.toMatch(/10\.0|-30/);
  });

  it("keeps the radius within the limits", () => {
    expect(body(compareHandler({ ...good, radiusKm: 999 }, cfg)).meta.radiusKm).toBe(10);
    expect(body(compareHandler({ ...good, radiusKm: 0.1 }, cfg)).meta.radiusKm).toBe(1);
  });

  it("rejects a location outside the area", () => {
    expect(compareHandler({ ...good, lat: 50, lng: 50 }, cfg).status).toBe(422);
    expect(compareHandler({ ...good, areaId: "nowhere" }, cfg).status).toBe(422);
  });

  it("checks the input", () => {
    expect(compareHandler({ ...good, lines: [] }, cfg).status).toBe(400);
    expect(compareHandler({ ...good, lines: Array(51).fill("milk") }, cfg).status).toBe(400);
    expect(compareHandler({ ...good, lines: ["x".repeat(81)] }, cfg).status).toBe(400);
    expect(compareHandler({ ...good, lines: [5] }, cfg).status).toBe(400);
    expect(compareHandler({ ...good, lat: undefined }, cfg).status).toBe(400);
    expect(compareHandler("nope", cfg).status).toBe(400);
  });

  it("does not use prices from another area", () => {
    const r = body(compareHandler({ ...good, ...{ lat: 20, lng: -40 }, areaId: "sample-village" }, cfg));
    const ids = r.shops.map((g: any) => g.shop.area);
    expect(new Set(ids)).toEqual(new Set(["sample-village"]));
  });
});

describe("price sending", () => {
  it("reads a text receipt and confirms prices end to end", async () => {
    const { catalog } = { catalog: readCatalog(cfg) };
    const shop = catalog.shops.find((s) => s.area === "sample-town")!;
    const milk = catalog.items.find((i) => i.name === "Milk")!;
    const prod = catalog.products.find((p) => p.itemId === milk.id && p.packSize === 1)!;
    const today = new Date().toISOString().slice(0, 10);
    const receipt = `SHOP: ${shop.chain}\nDATE: ${today}\nMilk 1L   1.10\nCARD **** **** **** 4242\n`;
    const read = body(await receiptReadHandler({ bytes: new TextEncoder().encode(receipt), mime: "text/plain" }, "sample-town", cfg));
    expect(read.lines).toHaveLength(1);
    expect(JSON.stringify(read)).not.toMatch(/4242/);
    expect(read.shopId).toBe(shop.id);
    expect(read.lines[0].itemId).toBe(milk.id);

    const sent = submissionConfirmHandler(
      { shopId: shop.id, date: today, lines: [{ text: "Milk 1L", amountMinor: 110, productId: prod.id }] },
      cfg,
    );
    expect(sent.status).toBe(200);
    expect(body(sent).accepted + body(sent).pending).toBe(1);
  });

  it("drops personal details even when a reader lets them through", async () => {
    const leaky = {
      name: "leaky",
      read: async () => ({
        lines: [
          { text: "Milk 1L", amountMinor: 129 },
          { text: "Visa 4111 1111 1111 1111", amountMinor: 500 },
          { text: "Customer Jane", amountMinor: 100 },
        ],
      }),
    };
    const r = body(await receiptReadHandler({ bytes: new Uint8Array([1]), mime: "image/jpeg" }, undefined, cfg, leaky));
    expect(r.lines.map((l: any) => l.text)).toEqual(["Milk 1L"]);
  });

  it("says plainly that photos are not supported yet", async () => {
    const r = await receiptReadHandler({ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg" }, undefined, cfg);
    expect(r.status).toBe(501);
    expect(body(r).error).toBe("reader_unavailable");
  });

  it("rejects empty and huge files", async () => {
    expect((await receiptReadHandler({ bytes: new Uint8Array(), mime: "text/plain" }, undefined, cfg)).status).toBe(400);
    expect((await receiptReadHandler({ bytes: new Uint8Array(2_000_001), mime: "text/plain" }, undefined, cfg)).status).toBe(413);
  });

  it("checks confirm input and reports", () => {
    expect(submissionConfirmHandler({ shopId: "s01" }, cfg).status).toBe(400);
    expect(submissionConfirmHandler({ shopId: "s01", date: "2026-11-01", lines: [] }, cfg).status).toBe(400);
    expect(reportHandler({ shopId: "s01", productId: "p0001", note: "wrong" }, cfg).status).toBe(200);
    expect(reportHandler({ shopId: "zzz", productId: "p0001" }, cfg).status).toBe(400);
  });
});

describe("health", () => {
  it("is ok with fresh data", () => {
    const r = body(healthHandler(cfg));
    expect(r.ok).toBe(true);
    expect(r.pricesStale).toBe(false);
  });
  it("reports stale prices", () => {
    const r = body(healthHandler(cfg, new Date(Date.now() + 60 * 86_400_000)));
    expect(r.pricesStale).toBe(true);
  });
  it("fails clearly when the data is broken", () => {
    fs.appendFileSync(path.join(cfg.dataDir, "prices.csv"), "p0001,s01,abc,EUR,false,,2026-01-01,sample\n");
    expect(healthHandler(cfg).status).toBe(503);
  });
});

describe("sample data sanity", () => {
  it("never shows a negative saving, and never uses a pack outside the size band", () => {
    const { catalog } = { catalog: readCatalog(cfg) };
    const names = catalog.items.map((i) => i.name);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const items = new Map(catalog.items.map((i) => [i.id, i]));
    const products = new Map(catalog.products.map((p) => [p.id, p]));
    for (let n = 0; n < 40; n++) {
      const lines = Array.from({ length: 3 + Math.floor(rnd() * 12) }, () => `${1 + Math.floor(rnd() * 3)} ${names[Math.floor(rnd() * names.length)]}`);
      const area = rnd() < 0.5 ? { areaId: "sample-town", lat: 10, lng: -30 } : { areaId: "sample-village", lat: 20, lng: -40 };
      const r = body(compareHandler({ lines, ...area, radiusKm: 1 + Math.floor(rnd() * 10) }, cfg));
      expect(r.summary.savingMinor).toBeGreaterThanOrEqual(0);
      for (const l of r.lines.filter((x: any) => x.status === "ok")) {
        const p = products.get(l.best.product.id)!;
        const item = items.get(p.itemId)!;
        expect(p.packSize).toBeGreaterThanOrEqual(item.minSize);
        expect(p.packSize).toBeLessThanOrEqual(item.maxSize);
      }
    }
  });
});
