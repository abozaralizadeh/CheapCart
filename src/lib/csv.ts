import fs from "node:fs";
import path from "node:path";

/** Small RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

export type CsvRecord = Record<string, string>;

export function parseCsvRecords(text: string): CsvRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: CsvRecord = {};
    headers.forEach((h, i) => {
      rec[h] = (r[i] ?? "").trim();
    });
    return rec;
  });
}

function escapeField(v: string | number | boolean): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | boolean)[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeField).join(",")).join("\n") + "\n";
}

export function readCsvFile(file: string): CsvRecord[] {
  return parseCsvRecords(fs.readFileSync(file, "utf8"));
}

/** Appends rows, writing the header first if the file is new or empty. */
export function appendCsv(file: string, headers: string[], rows: (string | number | boolean)[][]): void {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const exists = fs.existsSync(file) && fs.statSync(file).size > 0;
  const body = toCsv(headers, rows);
  fs.appendFileSync(file, exists ? body.slice(body.indexOf("\n") + 1) : body);
}
