import { qualityReport } from "../src/lib/reports";
import { readAreas, readCatalog } from "../src/lib/store";
import { setup } from "./_args";

const cfg = setup();
const catalog = readCatalog(cfg);
for (const area of readAreas(cfg)) {
  const q = qualityReport(catalog, area, cfg);
  console.log(`${q.area}: ${q.ready ? "READY" : "NOT READY"}`);
  console.log(`  shops ${q.shops}, items ${q.items}, items with a fresh price ${q.itemsWithFreshPrice} (${q.itemCoveragePct}%)`);
  console.log(`  items priced at one shop only ${q.itemsWithOneShopOnly}, average price age ${q.avgPriceAgeDays} days`);
  q.shopCoveragePct.forEach((s) => console.log(`  ${s.shop}: ${s.pct}% of products priced`));
}
