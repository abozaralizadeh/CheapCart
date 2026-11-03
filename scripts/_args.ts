import path from "node:path";
import { loadConfig } from "../src/lib/config";

export function setup() {
  return loadConfig();
}

export function fileArg(): string {
  const f = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!f) {
    console.error("Give a CSV file path.");
    process.exit(1);
  }
  return path.resolve(f);
}

export const hasFlag = (name: string) => process.argv.includes(name);
