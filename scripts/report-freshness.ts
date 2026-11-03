import { freshnessReport } from "../src/lib/reports";
import { readCatalog } from "../src/lib/store";
import { setup } from "./_args";

const cfg = setup();
const r = freshnessReport(readCatalog(cfg), cfg);
console.log(`Prices (latest per shop and product): ${r.total}`);
console.log(`  fresh ${r.fresh}, near the ${cfg.freshnessDays}-day limit ${r.nearLimit}, stale ${r.stale}, oldest ${r.oldestDays} days`);
r.byShop.forEach((s) => console.log(`  ${s.shop}: fresh ${s.fresh}, near limit ${s.nearLimit}, stale ${s.stale}`));
// Non-zero exit when most prices are not usable, so a timer or monitor can alert.
process.exit(r.total === 0 || r.fresh + r.nearLimit < r.total * 0.5 ? 2 : 0);
