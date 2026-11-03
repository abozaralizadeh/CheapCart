import fs from "node:fs";
import { parseCsvRecords, type CsvRecord } from "./csv";

/**
 * Where price rows come from. A new source (an open data feed, a licensed
 * feed from a shop) is one more class here. Each needs a legal check first,
 * and none ships in the code. There is no scraper on purpose.
 */
export interface PriceSource {
  id: string;
  name: string;
  load(): Promise<CsvRecord[]>;
}

export class CsvFileSource implements PriceSource {
  id = "csv";
  name: string;
  constructor(private file: string) {
    this.name = `CSV file ${file}`;
  }
  async load(): Promise<CsvRecord[]> {
    return parseCsvRecords(fs.readFileSync(this.file, "utf8"));
  }
}
