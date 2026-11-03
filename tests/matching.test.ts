import { describe, expect, it } from "vitest";
import { buildIndex, matchItem, suggest } from "../src/lib/matching";
import { smallCatalog } from "./helpers";

const cat = {
  ...smallCatalog(),
  items: [
    ...smallCatalog().items,
    { id: "ccho", name: "Dark chocolate", category: "", unit: "kg" as const, minSize: 0.1, maxSize: 0.2 },
    { id: "mcho", name: "Milk chocolate", category: "", unit: "kg" as const, minSize: 0.1, maxSize: 0.2 },
    { id: "tom", name: "Tomato", category: "", unit: "kg" as const, minSize: 0.4, maxSize: 1 },
  ],
};
const index = buildIndex(cat);
const id = (s: string) => matchItem(index, s)?.item.id;

describe("matchItem", () => {
  it("matches names and aliases", () => {
    expect(id("milk")).toBe("milk");
    expect(id("Whole Milk")).toBe("milk");
    expect(id("bread")).toBe("bread");
  });
  it("matches plurals and a size next to the name", () => {
    expect(id("eggs")).toBe("eggs");
    expect(id("milk 1l")).toBe("milk");
  });
  it("accepts a small typo", () => {
    expect(id("buter")).toBe("butter");
    expect(id("tomatoes")).toBe("tom");
  });
  it("does not guess when a word fits two items", () => {
    expect(id("chocolate")).toBeUndefined();
  });
  it("returns null for things it does not know", () => {
    expect(id("unicorn")).toBeUndefined();
    expect(id("")).toBeUndefined();
  });
  it("does not turn a dish into an ingredient", () => {
    expect(id("butter chicken")).toBeUndefined();
  });
});

describe("suggest", () => {
  it("puts prefix matches first and lists each item once", () => {
    const s = suggest(index, "mil");
    expect(s[0].id).toBe("milk");
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
  });
  it("finds words inside a name", () => {
    expect(suggest(index, "choc").map((x) => x.id)).toEqual(expect.arrayContaining(["ccho", "mcho"]));
  });
  it("returns nothing for an empty query", () => {
    expect(suggest(index, "  ")).toEqual([]);
  });
});
