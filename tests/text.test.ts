import { describe, expect, it } from "vitest";
import { keyOf, levenshtein, normalize, parseLine } from "../src/lib/text";

describe("parseLine", () => {
  it("reads plain names and quantities", () => {
    expect(parseLine("milk")).toMatchObject({ name: "milk", quantity: 1 });
    expect(parseLine("2 milk")).toMatchObject({ name: "milk", quantity: 2 });
    expect(parseLine("3 x eggs")).toMatchObject({ name: "eggs", quantity: 3 });
    expect(parseLine("eggs x4")).toMatchObject({ name: "eggs", quantity: 4 });
  });
  it("keeps sizes as part of the name", () => {
    expect(parseLine("milk 1l")).toMatchObject({ name: "milk 1l", quantity: 1 });
    expect(parseLine("500g butter")).toMatchObject({ name: "500g butter", quantity: 1 });
  });
  it("returns null for empty lines", () => {
    expect(parseLine("   ")).toBeNull();
  });
});

describe("normalize", () => {
  it("drops accents, case and punctuation", () => {
    expect(normalize("  Crème  Fraîche! ")).toBe("creme fraiche");
  });
  it("makes simple plurals match", () => {
    expect(keyOf("Bananas")).toBe(keyOf("banana"));
  });
  it("measures edit distance", () => {
    expect(levenshtein("tomato", "tomatoe")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
  });
});
