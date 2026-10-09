import { parseMct, serializeMct } from "@mct/parser";
import { describe, expect, it } from "vitest";
import { convertDocument } from "./convert";
import { detectVersion } from "./version";

const SRC_2022 = [
  "*VERSION",
  "   9.1.0",
  "",
  "*SECTION",
  "    2, TAPERED   , Nose              , CT, 0, 0, 0, 0, 0, 0, 0, 0, YES, NO, H  , 1, 1, USER",
  "       3.3, 0.5, 0.012, 0.02, 0.58, 0.02, 0, 0,  1.5, 0.5, 0.012, 0.02, 0.58, 0.02, 0, 0",
  "",
  "*BEAMLOAD",
  "  2788, BEAM   , UNILOAD, GZ, NO , NO, aDir[1], , , , 0, -9.51, 1, -9.51, 0, 0, 0, 0, Girder Weight, NO, 0, 0, NO,",
  "",
  "*LOADCOMB",
  "   NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0",
  "        ST, SW, 1.35",
  "",
  "*FUTURE-CMD",
  "  1, 2, 3",
  "",
  "*ENDDATA",
  "",
].join("\n");

describe("detectVersion", () => {
  it("maps stamps to generations", () => {
    expect(detectVersion(parseMct("a", SRC_2022)).version).toBe("2022");
    expect(
      detectVersion(parseMct("b", SRC_2022.replace("9.1.0", "9.6.0"))).version,
    ).toBe("2025");
  });

  it("falls back to schema heuristics without a stamp", () => {
    const noVersion = SRC_2022.replace("*VERSION\n   9.1.0\n\n", "");
    const d = detectVersion(parseMct("c", noVersion));
    expect(d.version).toBe("2022");
    expect(d.evidence.length).toBeGreaterThan(1);
  });

  it("reports unknown on conflicting evidence", () => {
    const mixed = SRC_2022.replace("aDir[1]", "LY").replace(
      "*VERSION\n   9.1.0\n\n",
      "",
    );
    // TAPERED says 2022, BEAMLOAD says 2025 -> unknown.
    expect(detectVersion(parseMct("d", mixed)).version).toBe("unknown");
  });
});

describe("convertDocument 2022 -> 2025", () => {
  it("applies verified rules and preserves the original text object", () => {
    const doc = parseMct("2022", SRC_2022);
    const before = serializeMct(doc);
    const report = convertDocument(doc, { from: "2022", to: "2025" });
    expect(serializeMct(doc)).toBe(before); // input untouched
    expect(report.ok).toBe(true);
    expect(report.output).toContain("9.6.0");
    expect(report.output).toContain("YES, NO, NO, H  , 1, 1, USER");
    expect(report.output).toContain("NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0, 1");
    // Unknown section preserved verbatim.
    expect(report.output).toContain("*FUTURE-CMD\n  1, 2, 3");
  });

  it("skips provisional rules unless explicitly included", () => {
    const doc = parseMct("2022", SRC_2022);
    const skipped = convertDocument(doc, { from: "2022", to: "2025" });
    expect(skipped.output).toContain("aDir[1]");
    expect(skipped.skippedProvisional.map((s) => s.ruleId)).toContain("MCT-CVT-003");

    const applied = convertDocument(doc, {
      from: "2022",
      to: "2025",
      includeProvisional: true,
    });
    expect(applied.output).toContain("NO, LY, , , , 0, -9.51");
    expect(applied.output).not.toContain("aDir[1]");
    const beamAudit = applied.applied.find((a) => a.ruleId === "MCT-CVT-003");
    expect(beamAudit?.severity).toBe("warning");
  });

  it("is a no-op when source and target match", () => {
    const doc = parseMct("2022", SRC_2022);
    const report = convertDocument(doc, { from: "2022", to: "2022" });
    expect(report.ok).toBe(true);
    expect(report.output).toBe(SRC_2022);
  });

  it("warns when detection contradicts the requested source", () => {
    const doc = parseMct("2025", SRC_2022.replace("9.1.0", "9.6.0"));
    const report = convertDocument(doc, { from: "2022", to: "2025" });
    expect(report.diagnostics.some((d) => d.code === "MCT-CONV-010")).toBe(true);
  });
});

describe("convertDocument 2025 -> 2022", () => {
  const SRC_2025 = [
    "*VERSION",
    "   9.6.0",
    "",
    "*SECTION",
    "    2, TAPERED   , Nose              , CT, 0, 0, 0, 0, 0, 0, 0, 0, YES, NO, NO, H  , 1, 1, USER",
    "       3.3, 0.5, 0.012, 0.02, 0.58, 0.02, 0, 0,  1.5, 0.5, 0.012, 0.02, 0.58, 0.02, 0, 0",
    "",
    "*LOADCOMB",
    "   NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0, 1",
    "        ST, SW, 1.35",
    "",
    "*ENDDATA",
    "",
  ].join("\n");

  it("reverses verified mappings", () => {
    const report = convertDocument(parseMct("2025", SRC_2025), {
      from: "2025",
      to: "2022",
    });
    expect(report.ok).toBe(true);
    expect(report.output).toContain("9.1.0");
    expect(report.output).toContain("YES, NO, H  , 1, 1, USER");
    expect(report.output).toContain("NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0\n");
  });

  it("blocks lossy downgrades instead of corrupting them", () => {
    const lossy = SRC_2025.replace("YES, NO, NO, H", "YES, NO, YES, H");
    const report = convertDocument(parseMct("2025", lossy), {
      from: "2025",
      to: "2022",
    });
    expect(report.ok).toBe(false);
    expect(report.diagnostics.some((d) => d.severity === "loss")).toBe(true);
    // Record left unchanged.
    expect(report.output).toContain("YES, NO, YES, H");
  });

  it("blocks non-default LcomFactor downgrades", () => {
    const lossy = SRC_2025.replace(", 0, 0, 0, 1", ", 0, 0, 0, 2");
    const report = convertDocument(parseMct("2025", lossy), {
      from: "2025",
      to: "2022",
    });
    expect(report.ok).toBe(false);
    expect(report.output).toContain(", 0, 0, 0, 2");
  });
});
