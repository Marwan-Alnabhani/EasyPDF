import { describe, expect, it } from "vitest";
import { baseName, formatBytes, hexToRgb01, parsePageList, parseRangeGroups } from "./files";

describe("parsePageList", () => {
  it("parses single pages and ranges into 0-based indices", () => {
    expect(parsePageList("1-3, 5", 10)).toEqual([0, 1, 2, 4]);
  });

  it("treats an open-ended range as running to the last page", () => {
    expect(parsePageList("8-", 10)).toEqual([7, 8, 9]);
  });

  it("treats a range with no start as starting at page 1", () => {
    expect(parsePageList("-3", 10)).toEqual([0, 1, 2]);
  });

  it("treats a bare dash as every page", () => {
    expect(parsePageList("-", 3)).toEqual([0, 1, 2]);
  });

  it("supports descending ranges", () => {
    expect(parsePageList("3-1", 5)).toEqual([2, 1, 0]);
  });

  it("accepts semicolons and extra spaces", () => {
    expect(parsePageList(" 2 ; 4 - 5 ", 5)).toEqual([1, 3, 4]);
  });

  it("keeps duplicates and the given order", () => {
    expect(parsePageList("2, 1, 2", 3)).toEqual([1, 0, 1]);
  });

  it("rejects empty input", () => {
    expect(() => parsePageList(" , ", 5)).toThrow(/at least one page/);
  });

  it("rejects pages outside the document", () => {
    expect(() => parsePageList("0", 5)).toThrow(/outside the document/);
    expect(() => parsePageList("4-6", 5)).toThrow(/outside the document \(1-5\)/);
  });

  it("rejects text that isn't a page or range", () => {
    expect(() => parsePageList("abc", 5)).toThrow(/not a valid page or range/);
    expect(() => parsePageList("1-2-3", 5)).toThrow(/not a valid page or range/);
  });
});

describe("parseRangeGroups", () => {
  it("keeps each comma-separated group separate", () => {
    expect(parseRangeGroups("1-3, 4-", 6)).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });
});

describe("small helpers", () => {
  it("baseName drops only the last extension", () => {
    expect(baseName("report.final.pdf")).toBe("report.final");
    expect(baseName("noext")).toBe("noext");
  });

  it("formatBytes picks a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });

  it("hexToRgb01 converts to 0-1 channels", () => {
    expect(hexToRgb01("#ff8000")).toEqual([1, 128 / 255, 0]);
  });
});
