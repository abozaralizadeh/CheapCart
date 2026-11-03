import { describe, expect, it } from "vitest";
import { compare, isFresh } from "../src/lib/compare";
import { NOW, smallCatalog, smallIndex } from "./helpers";

const opts = { freshnessDays: 14, currency: "EUR" };
const run = (lines: string[], radiusKm = 3, catalog = smallCatalog()) =>
  compare(catalog, smallIndex(), { lines, origin: { lat: 0, lng: 0 }, radiusKm, now: NOW }, opts);

describe("compare", () => {
  const r = run(["2 milk", "bread", "eggs", "unicorn", "butter"]);

  it("picks the cheapest unit price and breaks ties by distance", () => {
    const milk = r.lines[0];
    expect(milk.status).toBe("ok");
    // B and C both charge 100. B is nearer.
    expect(milk.best?.shop.id).toBe("B");
    expect(milk.best?.lineTotalMinor).toBe(200);
  });

  it("ignores a pack outside the item's size band", () => {
    // The 2 L pack at B costs 75 per litre, but milk is defined as about 1 L.
    expect(r.lines[0].best?.product.id).toBe("pm1");
  });

  it("ignores shops outside the distance", () => {
    // D sells milk for 50 but is about 5.5 km away.
    expect(r.lines[0].alternatives.map((o) => o.shop.id)).not.toContain("D");
    expect(run(["milk"], 10).lines[0].best?.shop.id).toBe("D");
  });

  it("uses only the newest price for a shop and product", () => {
    const a = r.lines[0].alternatives.find((o) => o.shop.id === "A");
    expect(a?.amountMinor).toBe(120);
  });

  it("drops stale prices and says so", () => {
    expect(r.lines[2].best?.shop.id).toBe("A");
    expect(r.lines[2].alternatives).toHaveLength(0);
  });

  it("drops ended promotions", () => {
    expect(r.lines[4].status).toBe("no_price_nearby");
  });

  it("marks unknown items and leaves them out of the totals", () => {
    expect(r.lines[3].status).toBe("not_found");
    expect(r.summary.pricedCount).toBe(3);
    expect(r.summary.unpricedCount).toBe(2);
    expect(r.summary.totalMinor).toBe(200 + 140 + 300);
  });

  it("groups by shop, nearest first", () => {
    expect(r.shops.map((g) => g.shop.id)).toEqual(["A", "B", "C"]);
    expect(r.summary.shopsNeeded).toBe(3);
  });

  it("works out the best single shop and the saving on shared items only", () => {
    const s = r.summary;
    expect(s.bestSingleShop?.shop.id).toBe("A");
    expect(s.bestSingleShop?.coveredCount).toBe(3);
    expect(s.bestSingleShop?.totalMinor).toBe(240 + 150 + 300);
    expect(s.comparedCount).toBe(3);
    expect(s.perItemOnComparedMinor).toBe(640);
    expect(s.savingMinor).toBe(50);
    expect(s.savingPct).toBe(7.2);
  });

  it("counts only items the single shop also covers", () => {
    const only = run(["eggs", "bread"]);
    expect(only.summary.bestSingleShop?.shop.id).toBe("A");
    expect(only.summary.comparedCount).toBe(2);
    expect(only.summary.savingMinor).toBe(10);
  });

  it("handles a list with nothing priced", () => {
    const empty = run(["unicorn"]);
    expect(empty.summary.pricedCount).toBe(0);
    expect(empty.summary.bestSingleShop).toBeUndefined();
    expect(empty.summary.savingMinor).toBe(0);
  });

  it("returns no price when there are no shops nearby", () => {
    const far = compare(smallCatalog(), smallIndex(), { lines: ["milk"], origin: { lat: 40, lng: 40 }, radiusKm: 3, now: NOW }, opts);
    expect(far.lines[0].status).toBe("no_price_nearby");
    expect(far.meta.shopsInRange).toBe(0);
  });

  it("skips inactive shops", () => {
    const cat = smallCatalog();
    cat.shops.find((s) => s.id === "B")!.active = false;
    expect(run(["milk"], 3, cat).lines[0].best?.shop.id).toBe("C");
  });

  it("flags sample prices", () => {
    const cat = smallCatalog();
    cat.prices.forEach((p) => (p.source = "sample"));
    expect(run(["milk"], 3, cat).summary.sample).toBe(true);
    expect(r.summary.sample).toBe(false);
  });
});

describe("isFresh", () => {
  const p = { productId: "x", shopId: "y", amountMinor: 1, currency: "EUR", isPromo: false, promoEnds: "", seenOn: "2026-10-19", source: "t" };
  it("accepts exactly the limit and rejects one day more", () => {
    expect(isFresh({ ...p, seenOn: "2026-10-19" }, NOW, 14)).toBe(true);
    expect(isFresh({ ...p, seenOn: "2026-10-18" }, NOW, 14)).toBe(false);
  });
  it("rejects dates far in the future", () => {
    expect(isFresh({ ...p, seenOn: "2026-11-20" }, NOW, 14)).toBe(false);
  });
});
