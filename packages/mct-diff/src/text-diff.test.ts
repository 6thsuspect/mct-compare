import { readFileSync } from "node:fs";
import { parseMct } from "@mct/parser";
import { describe, expect, it } from "vitest";
import { diffDocuments, diffLines, toUnifiedDiff } from "./text-diff";

describe("diffLines", () => {
  it("reports zero differences for identical inputs", () => {
    const a = ["*NODE", "  1, 0, 0, 0"];
    const r = diffLines(a, [...a]);
    expect(r.hunks).toHaveLength(0);
    expect(r.added + r.deleted + r.modifiedBefore).toBe(0);
    expect(r.lineMap).toHaveLength(2);
  });

  it("detects a replaced line", () => {
    const r = diffLines(["a", "b", "c"], ["a", "B", "c"]);
    expect(r.hunks).toHaveLength(1);
    expect(r.hunks[0].op).toBe("replace");
    expect(r.modifiedBefore).toBe(1);
    expect(r.modifiedAfter).toBe(1);
  });

  it("detects pure insertions and deletions", () => {
    const ins = diffLines(["a", "c"], ["a", "b", "c"]);
    expect(ins.hunks[0].op).toBe("insert");
    expect(ins.added).toBe(1);
    const del = diffLines(["a", "b", "c"], ["a", "c"]);
    expect(del.hunks[0].op).toBe("delete");
    expect(del.deleted).toBe(1);
  });

  it("ignores whitespace-only edits when requested", () => {
    const a = ["  101, 0.0, 0.0, 0.0"];
    const b = ["101,0.0,0.0,0.0"];
    expect(diffLines(a, b).hunks).toHaveLength(1);
    expect(diffLines(a, b, { ignoreWhitespace: true }).hunks).toHaveLength(0);
  });

  it("renders a unified diff", () => {
    const a = ["l1", "l2", "l3"];
    const b = ["l1", "L2", "l3"];
    const r = diffLines(a, b);
    const ud = toUnifiedDiff("a.mct", "b.mct", a, b, r.hunks, 1);
    expect(ud).toContain("--- a.mct");
    expect(ud).toContain("-l2");
    expect(ud).toContain("+L2");
  });
});

describe("reference fixtures", () => {
  const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
  const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

  it("diffs the two references with localised hunks", () => {
    const docA = parseMct("2022", ref2022);
    const docB = parseMct("2025", ref2025);
    const r = diffDocuments(docA, docB);
    expect(r.hunks.length).toBeGreaterThan(200);
    // Only sections known to change may carry hunks.
    const allowed = new Set([
      "VERSION",
      "SECTION",
      "DGN-SECT",
      "DGN-STEEL",
      "BEAMLOAD",
      "LOADCOMB",
      "DGN-MATL",
    ]);
    for (const h of r.hunks) {
      expect(allowed.has(h.aSection ?? "?") || allowed.has(h.bSection ?? "?")).toBe(
        true,
      );
    }
    // The VERSION hunk must be present.
    const versionHunk = r.hunks.find(
      (h) => h.aSection === "VERSION" && h.op === "replace",
    );
    expect(versionHunk?.aLines).toEqual(["   9.1.0"]);
    expect(versionHunk?.bLines).toEqual(["   9.6.0"]);
  });
});
