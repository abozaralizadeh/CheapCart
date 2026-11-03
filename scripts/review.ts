import { readCatalog } from "../src/lib/store";
import { approve, readQueue, readReports, reject } from "../src/server/submissions";
import { setup } from "./_args";

// Usage:
//   npm run review -- list
//   npm run review -- approve <id> [--product <productId>]
//   npm run review -- reject <id>
//   npm run review -- reports
const cfg = setup();
const [cmd, id] = process.argv.slice(2);
const product = process.argv.includes("--product") ? process.argv[process.argv.indexOf("--product") + 1] : undefined;

try {
  if (cmd === "list") {
    const pending = readQueue(cfg).filter((e) => e.status === "pending");
    console.log(pending.length ? `${pending.length} waiting:` : "Nothing waiting.");
    pending.forEach((e) => console.log(`  ${e.id}  shop ${e.shopId}  product ${e.productId || "?"}  ${(e.amountMinor / 100).toFixed(2)}  "${e.text}"  (${e.reason})`));
  } else if (cmd === "approve" && id) {
    const e = approve(cfg, readCatalog(cfg), id, product);
    console.log(`Approved ${e.id}. The price is live.`);
  } else if (cmd === "reject" && id) {
    console.log(`Rejected ${reject(cfg, id).id}.`);
  } else if (cmd === "reports") {
    const r = readReports(cfg);
    console.log(r.length ? `${r.length} wrong price reports:` : "No reports.");
    r.forEach((x) => console.log(`  ${x.date}  shop ${x.shop_id}  product ${x.product_id}  ${x.note}`));
  } else {
    console.log("Usage: npm run review -- list | approve <id> [--product <productId>] | reject <id> | reports");
    process.exit(1);
  }
} catch (e) {
  console.error(String((e as Error).message));
  process.exit(1);
}
