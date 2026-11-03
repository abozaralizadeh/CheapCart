import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tmpDir } from "./helpers";

const root = path.resolve(__dirname, "..");

describe("backup and restore scripts", () => {
  it("brings back the data and the runtime files after they are damaged", () => {
    const app = tmpDir();
    const backups = tmpDir();
    fs.mkdirSync(path.join(app, "data/sample"), { recursive: true });
    fs.mkdirSync(path.join(app, "data/runtime"), { recursive: true });
    fs.mkdirSync(path.join(app, "config"));
    fs.writeFileSync(path.join(app, "data/sample/prices.csv"), "a,b\n1,2\n");
    fs.writeFileSync(path.join(app, "data/runtime/reports.csv"), "date,note\n");
    fs.writeFileSync(path.join(app, "config/areas.json"), "{}");

    execFileSync(path.join(root, "scripts/backup.sh"), [app, backups]);
    const archive = fs.readdirSync(backups).find((f) => f.endsWith(".tar.gz"));
    expect(archive).toBeTruthy();

    fs.rmSync(path.join(app, "data/sample/prices.csv"));
    fs.writeFileSync(path.join(app, "data/runtime/reports.csv"), "damaged");

    execFileSync(path.join(root, "scripts/restore.sh"), [path.join(backups, archive!), app]);
    expect(fs.readFileSync(path.join(app, "data/sample/prices.csv"), "utf8")).toBe("a,b\n1,2\n");
    expect(fs.readFileSync(path.join(app, "data/runtime/reports.csv"), "utf8")).toBe("date,note\n");
    const kept = fs.readdirSync(path.join(app, "data")).filter((f) => f.includes("before-restore"));
    expect(kept).toHaveLength(2);
  });

  it("keeps only the newest archives", () => {
    const app = tmpDir();
    const backups = tmpDir();
    fs.mkdirSync(path.join(app, "data/sample"), { recursive: true });
    for (let i = 0; i < 3; i++) {
      fs.writeFileSync(path.join(backups, `cheapcart-2026010${i}-000000.tar.gz`), "x");
    }
    execFileSync(path.join(root, "scripts/backup.sh"), [app, backups], { env: { ...process.env, BACKUP_KEEP: "2" } });
    expect(fs.readdirSync(backups).filter((f) => f.endsWith(".tar.gz"))).toHaveLength(2);
  });
});
