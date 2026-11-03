import { unmatchedReport } from "../src/server/unmatched";
import { setup } from "./_args";

const cfg = setup();
const rows = unmatchedReport(cfg);
console.log(rows.length ? "Most common list lines we could not match (older than 90 days are removed):" : "No unmatched lines.");
rows.forEach((r) => console.log(`  ${r.count}  ${r.text}`));
