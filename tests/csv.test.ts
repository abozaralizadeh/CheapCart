import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendCsv, parseCsv, parseCsvRecords, toCsv } from "../src/lib/csv";
import { tmpDir } from "./helpers";

describe("csv", () => {
  it("reads quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
  it("round-trips awkward text", () => {
    const text = toCsv(["a", "b"], [["x,y", 'q"uote'], ["line\nbreak", "ok"]]);
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["x,y", 'q"uote'],
      ["line\nbreak", "ok"],
    ]);
  });
  it("maps rows to records and skips blank lines", () => {
    expect(parseCsvRecords("id,name\n1,Milk\n\n2,Bread\n")).toEqual([
      { id: "1", name: "Milk" },
      { id: "2", name: "Bread" },
    ]);
  });
  it("appends and writes the header only once", () => {
    const f = path.join(tmpDir(), "x.csv");
    appendCsv(f, ["a", "b"], [["1", "2"]]);
    appendCsv(f, ["a", "b"], [["3", "4"]]);
    expect(fs.readFileSync(f, "utf8")).toBe("a,b\n1,2\n3,4\n");
  });
});
