import { beforeEach, describe, expect, it } from "vitest";
import { limited, readJson } from "../src/server/route-helpers";
import { resetRateLimits } from "../src/server/ratelimit";
import { tmpConfig } from "./helpers";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/compare", { method: "POST", body, headers });

describe("request size limits", () => {
  beforeEach(() => {
    tmpConfig();
    resetRateLimits();
  });

  it("refuses a JSON request that declares a huge body", () => {
    const res = limited(post("{}", { "content-length": "5000000" }), "general");
    expect(res?.status).toBe(413);
  });

  it("lets a normal request through", () => {
    expect(limited(post("{}", { "content-length": "2" }), "general")).toBeNull();
  });

  it("allows a bigger body for the receipt upload than for JSON", () => {
    expect(limited(post("x", { "content-length": "1000000" }), "submit")).toBeNull();
    expect(limited(post("x", { "content-length": "1000000" }), "general")?.status).toBe(413);
  });

  it("returns null for JSON over the cap even without a length header", async () => {
    expect(await readJson(post(JSON.stringify({ text: "x".repeat(200_000) })))).toBeNull();
    expect(await readJson(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJson(post("not json"))).toBeNull();
  });
});
