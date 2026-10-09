import { readFileSync } from "node:fs";
import { convertDocument } from "@mct/converter";
import { buildModel, diffModels } from "@mct/diff";
import { parseMct } from "@mct/parser";
import { describe, expect, it } from "vitest";

const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

const FULL_22_25 = {
  from: "2022" as const,
  to: "2025" as const,
  includeProvisional: true,
  refreshComments: true,
};
const FULL_25_22 = {
  from: "2025" as const,
  to: "2022" as const,
  includeProvisional: true,
  refreshComments: true,
};

describe("reference conversion 2022 -> 2025", () => {
  it("reproduces the 2025 reference byte-identically with full options", () => {
    const report = convertDocument(parseMct("2022", ref2022), FULL_22_25);
    expect(report.ok).toBe(true);
    expect(report.output).toBe(ref2025);
  });

  it("converts all data lines without comment refresh", () => {
    const report = convertDocument(parseMct("2022", ref2022), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
    });
    expect(report.ok).toBe(true);
    const dataLines = (text: string): string[] =>
      text
        .split("\n")
        .filter((l) => l.trim() !== "" && !l.trim().startsWith(";"));
    expect(dataLines(report.output ?? "")).toEqual(dataLines(ref2025));
  });

  it("records every change in the audit trail", () => {
    const report = convertDocument(parseMct("2022", ref2022), FULL_22_25);
    // 242 TAPERED + 1363 BEAMLOAD + 2 LOADCOMB + 3 DGN-MATL + 1 VERSION
    expect(report.recordsChanged).toBe(1611);
    const byRule = new Map<string, number>();
    for (const a of report.applied) {
      byRule.set(a.ruleId, (byRule.get(a.ruleId) ?? 0) + 1);
    }
    expect(byRule.get("MCT-CVT-001")).toBe(1);
    expect((byRule.get("MCT-CVT-002A") ?? 0) + (byRule.get("MCT-CVT-002B") ?? 0)).toBe(242);
    expect(byRule.get("MCT-CVT-003")).toBe(1363);
    expect(byRule.get("MCT-CVT-004")).toBe(2);
    expect(byRule.get("MCT-CVT-005")).toBe(3);
    expect(byRule.get("MCT-CVT-100")).toBeGreaterThan(20);
  });
});

describe("reference conversion 2025 -> 2022", () => {
  it("reproduces the 2022 reference byte-identically with full options", () => {
    const report = convertDocument(parseMct("2025", ref2025), FULL_25_22);
    expect(report.ok).toBe(true);
    expect(report.output).toBe(ref2022);
  });
});

describe("conversion stability", () => {
  it("is idempotent: a second pass changes nothing", () => {
    const once = convertDocument(parseMct("2022", ref2022), FULL_22_25);
    expect(once.output).toBeDefined();
    const twice = convertDocument(parseMct("2025-once", once.output ?? ""), FULL_22_25);
    expect(twice.recordsChanged).toBe(0);
    expect(twice.output).toBe(once.output);
  });

  it("round-trips 2022 -> 2025 -> 2022 with no engineering drift", () => {
    const fwd = convertDocument(parseMct("2022", ref2022), FULL_22_25);
    const back = convertDocument(parseMct("2025", fwd.output ?? ""), FULL_25_22);
    expect(back.ok).toBe(true);
    expect(back.output).toBe(ref2022);
    // Belt and braces: semantic equivalence of original vs round-tripped.
    const semantic = diffModels(
      buildModel(parseMct("2022", ref2022)),
      buildModel(parseMct("2022-rt", back.output ?? "")),
    );
    expect(semantic.summary).toMatchObject({
      modified: 0,
      added: 0,
      removed: 0,
      unclassified: 0,
    });
  });

  it("blocks lossy downgrades instead of corrupting them", () => {
    const tampered = ref2025.replace(
      "YES, NO, NO, H  , 1, 1, USER",
      "YES, NO, YES, H  , 1, 1, USER",
    );
    const report = convertDocument(parseMct("2025", tampered), FULL_25_22);
    expect(report.ok).toBe(false);
    expect(report.diagnostics.some((d) => d.severity === "loss")).toBe(true);
  });
});
