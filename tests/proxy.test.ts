import { describe, expect, it } from "vitest";
import { clientKey } from "../src/server/ratelimit";
import { withBase } from "../src/lib/basepath";

const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});

describe("client key for rate limits", () => {
  it("ignores x-forwarded-for when no proxy is trusted", () => {
    expect(clientKey(h("1.2.3.4"), "")).toBe("direct");
    expect(clientKey(h("1.2.3.4"), "false")).toBe("direct");
  });

  it("uses the hop our own proxy added when a proxy is trusted", () => {
    expect(clientKey(h("1.2.3.4"), "127.0.0.1")).toBe("1.2.3.4");
    // A client that sends its own header can't pick its key: the proxy's hop comes last.
    expect(clientKey(h("6.6.6.6, 1.2.3.4"), "127.0.0.1")).toBe("1.2.3.4");
    expect(clientKey(h(), "127.0.0.1")).toBe("direct");
  });
});

describe("base path", () => {
  it("leaves paths alone when the app runs at the root", () => {
    expect(withBase("/api/compare")).toBe("/api/compare");
  });
});
