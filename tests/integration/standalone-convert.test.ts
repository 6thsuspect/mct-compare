import { readFileSync } from "node:fs";
import { convertDocument, detectVersion } from "@mct/converter";
import { parseMct } from "@mct/parser";
import { describe, expect, it } from "vitest";

/**
 * Standalone flow: an arbitrary MCT file (not one of the references) is
 * auto-detected and converted in either direction.
 */
describe("standalone conversion", () => {
  const mini = readFileSync("fixtures/conversion-cases/mini-2022.mct", "utf8");

  it("detects 2022 from schema heuristics when the stamp is missing", () => {
    const noStamp = mini
      .split("\n")
      .filter((l) => !l.startsWith("*VERSION") && !l.includes("9.1.0"))
      .join("\n");
    const d = detectVersion(parseMct("unrelated.mct", noStamp));
    expect(d.version).toBe("2022");
    expect(d.evidence.length).toBeGreaterThan(0);
  });

  it("converts the unrelated file forward with all rules applied", () => {
    const report = convertDocument(parseMct("mini.mct", mini), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
      refreshComments: false,
    });
    expect(report.ok).toBe(true);
    expect(report.output).toContain("9.6.0");
    expect(report.output).toContain("NO, NO,"); // bHUMBLY inserted
    expect(report.output).toContain("NO, LY,"); // BEAMLOAD respelled
    expect(report.output).toMatch(/NAME=C1, STEEL, STRENGTH, 0, 0, , 0, 0, 0, 1/);
    const ids = report.applied.map((a) => a.ruleId).sort();
    expect(ids).toEqual([
      "MCT-CVT-001",
      "MCT-CVT-002A",
      "MCT-CVT-002B",
      "MCT-CVT-003",
      "MCT-CVT-004",
    ]);
  });

  it("round-trips the unrelated file byte-identically", () => {
    const fwd = convertDocument(parseMct("mini.mct", mini), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
      refreshComments: false,
    });
    const back = convertDocument(parseMct("mini.mct", fwd.output ?? ""), {
      from: "2025",
      to: "2022",
      includeProvisional: true,
      refreshComments: false,
    });
    expect(back.ok).toBe(true);
    expect(back.output).toBe(mini);
  });
});
