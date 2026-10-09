import { readFileSync } from "node:fs";
import { convertDocument } from "@mct/converter";
import { parseMct } from "@mct/parser";
import { describe, expect, it } from "vitest";

/**
 * Regression: comment templates shared by SECTION and DGN-SECT must be
 * patched within their own section scope. An early implementation keyed
 * replacement outputs globally, so the [Dumbbell] line landed twice in
 * DGN-SECT and never in SECTION.
 */
describe("comment patch scoping", () => {
  const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");

  it("inserts [Dumbbell] exactly once per section family member", () => {
    const report = convertDocument(parseMct("2022", ref2022), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
      refreshComments: true,
    });
    const lines = (report.output ?? "").split("\n");
    const idx = lines
      .map((l, i) => (l === "; [Dumbbell] : bInfusion" ? i : -1))
      .filter((i) => i >= 0);
    expect(idx).toHaveLength(2);

    const sectionOf = (line0: number): string => {
      for (let i = line0; i >= 0; i--) {
        if (lines[i].startsWith("*")) return lines[i];
      }
      return "";
    };
    expect(sectionOf(idx[0])).toMatch(/^\*SECTION\s/);
    expect(sectionOf(idx[1])).toMatch(/^\*DGN-SECT/);
  });

  it("does not duplicate inserts on a second pass", () => {
    const once = convertDocument(parseMct("2022", ref2022), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
      refreshComments: true,
    });
    const twice = convertDocument(parseMct("2025", once.output ?? ""), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
      refreshComments: true,
    });
    expect(twice.output).toBe(once.output);
  });
});
