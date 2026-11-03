import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { log, rotateIfNeeded } from "../src/server/logger";
import { allow, resetRateLimits } from "../src/server/ratelimit";
import { tmpConfig, tmpDir } from "./helpers";

describe("log file", () => {
  it("rotates at the size limit and keeps only a few files", () => {
    const f = path.join(tmpDir(), "app.log");
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(f, "x".repeat(100));
      rotateIfNeeded(f, 50, 3);
    }
    const files = fs.readdirSync(path.dirname(f)).sort();
    expect(files).toEqual(["app.log.1", "app.log.2", "app.log.3"]);
  });

  it("writes JSON lines and stays small", () => {
    const { cfg } = tmpConfig({ LOG_MAX_BYTES: "400", LOG_KEEP: "2" });
    for (let i = 0; i < 60; i++) log("info", "compare", { lines: i });
    const files = fs.readdirSync(cfg.logDir);
    expect(files.length).toBeLessThanOrEqual(3);
    for (const f of files) expect(fs.statSync(path.join(cfg.logDir, f)).size).toBeLessThan(800);
    const first = fs.readFileSync(path.join(cfg.logDir, "app.log"), "utf8").trim().split("\n")[0];
    expect(JSON.parse(first)).toMatchObject({ level: "info", event: "compare" });
  });
});

describe("rate limit", () => {
  it("blocks after the limit and opens again after the window", () => {
    resetRateLimits();
    expect([1, 2, 3].map(() => allow("k", 2, 1000, 0))).toEqual([true, true, false]);
    expect(allow("k", 2, 1000, 1001)).toBe(true);
    expect(allow("other", 2, 1000, 0)).toBe(true);
  });
});
