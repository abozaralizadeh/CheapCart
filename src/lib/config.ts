import path from "node:path";

const num = (v: string | undefined, d: number): number => {
  if (v === undefined || v.trim() === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const str = (v: string | undefined, d: string): string => (v === undefined || v.trim() === "" ? d : v.trim());

/**
 * All settings come from the environment, with the Proposed defaults
 * listed in .env.example. Read on each call so tests can change them.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const root = process.cwd();
  const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(root, p));
  return {
    dataDir: abs(str(env.DATA_DIR, "data/sample")),
    runtimeDir: abs(str(env.DATA_RUNTIME_DIR, "data/runtime")),
    areasFile: abs(str(env.AREAS_FILE, "config/areas.json")),
    launchAreas: str(env.LAUNCH_AREAS, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    currency: str(env.CURRENCY, "EUR"),
    freshnessDays: num(env.FRESHNESS_DAYS, 14),
    defaultRadiusKm: num(env.DEFAULT_RADIUS_KM, 3),
    minRadiusKm: num(env.MIN_RADIUS_KM, 1),
    maxRadiusKm: num(env.MAX_RADIUS_KM, 10),
    maxListLines: 50,
    maxLineLength: 80,
    receiptReader: str(env.RECEIPT_READER, "fake"),
    receiptMaxAgeDays: num(env.RECEIPT_MAX_AGE_DAYS, 7),
    outlierPct: num(env.OUTLIER_PCT, 0.4),
    priceJumpPct: num(env.PRICE_JUMP_PCT, 0.5),
    maxPriceMinor: 50_000,
    unmatchedRetentionDays: 90,
    rateLimitPerMin: num(env.RATE_LIMIT_PER_MIN, 60),
    submitRateLimitPerHour: num(env.SUBMIT_RATE_LIMIT_PER_HOUR, 10),
    logDir: abs(str(env.LOG_DIR, "logs")),
    logMaxBytes: num(env.LOG_MAX_BYTES, 1_000_000),
    logKeep: num(env.LOG_KEEP, 3),
    operatorName: str(env.OPERATOR_NAME, "[operator name not set]"),
    contactEmail: str(env.CONTACT_EMAIL, "[contact email not set]"),
  };
}

export type Config = ReturnType<typeof loadConfig>;
