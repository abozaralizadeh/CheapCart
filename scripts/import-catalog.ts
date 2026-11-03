import { importCatalog } from "../src/lib/importer";
import { CsvFileSource } from "../src/lib/sources";
import { fileArg, setup } from "./_args";

// Usage: npm run import:catalog <file.csv> -- --kind shops|items|aliases|products
const kind = process.argv.find((a) => a.startsWith("--kind="))?.split("=")[1] ?? process.argv[process.argv.indexOf("--kind") + 1];
if (!["shops", "items", "aliases", "products"].includes(kind ?? "")) {
  console.error("Usage: npm run import:catalog <file.csv> -- --kind shops|items|aliases|products");
  process.exit(1);
}
const cfg = setup();
const rows = await new CsvFileSource(fileArg()).load();
const report = importCatalog(cfg, kind as "shops", rows);
console.log(`Into ${cfg.dataDir}: ${report.added} added, ${report.updated} updated, ${report.errors.length} errors`);
report.errors.forEach((e) => console.log(`  row ${e.row}: ${e.error}`));
process.exit(report.errors.length ? 1 : 0);
