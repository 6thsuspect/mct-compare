import { readFileSync } from "node:fs";
import { parseMct } from "@mct/parser";
import { describe, expect, it } from "vitest";
import { checkCompatibility } from "./compatibility";
import { validateText } from "./index";
import { expandIdList } from "./references";

const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

const GOOD = [
  "*VERSION",
  "   9.1.0",
  "",
  "*NODE",
  "  1, 0, 0, 0",
  "  2, 1, 0, 0",
  "",
  "*MATERIAL",
  "    1, STEEL, E350, 0, 0, , C, NO, 0.02",
  "",
  "*SECTION",
  "    1, DBUSER, S1, CT, 0, 0, 0, 0, 0, 0, YES, NO, H",
  "",
  "*ELEMENT",
  "  10, BEAM, 1, 1, 1, 2, 0, 0",
  "",
  "*STLDCASE",
  "   SW, D,",
  "",
  "*USE-STLD, SW",
  "",
  "*BEAMLOAD",
  "  10, BEAM, UNILOAD, GZ, NO, NO, aDir[1], , , , 0, -1, 1, -1, 0, 0, 0, 0, G1, NO, 0, 0, NO,",
  "",
  "*LOAD-GROUP",
  "  G1",
  "",
  "*LOADCOMB",
  "   NAME=C1, STEEL, STRENGTH, 0, 0, , 0, 0, 0",
  "        ST, SW, 1.35",
  "",
  "*CONSTRAINT",
  "   1 2, 111111,",
  "",
  "*ENDDATA",
  "",
].join("\n");

describe("expandIdList", () => {
  it("expands ranges and steps", () => {
    expect(expandIdList("2648to2652")).toEqual([2648, 2649, 2650, 2651, 2652]);
    expect(expandIdList("1to7by3")).toEqual([1, 4, 7]);
    expect(expandIdList("5to1")).toEqual([5, 4, 3, 2, 1]);
    expect(expandIdList("2999 3020")).toEqual([2999, 3020]);
    expect(expandIdList("")).toEqual([]);
  });

  it("caps hostile ranges", () => {
    expect(expandIdList("1to999999999")).toEqual([]);
  });
});

describe("validateText", () => {
  it("accepts a consistent model", () => {
    const report = validateText("good.mct", GOOD);
    expect(report.fileOk).toBe(true);
    expect(report.counts.error).toBe(0);
    expect(report.counts.loss).toBe(0);
    expect(report.detectedVersion).toBe("2022");
  });

  it("flags missing node and section references", () => {
    const bad = GOOD.replace("  10, BEAM, 1, 1, 1, 2, 0, 0", "  10, BEAM, 9, 9, 1, 77, 0, 0");
    const report = validateText("bad.mct", bad);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("MCT-ELEM-001");
    expect(codes).toContain("MCT-ELEM-002");
    expect(codes).toContain("MCT-ELEM-003");
  });

  it("flags duplicate ids and unknown load cases", () => {
    const bad = GOOD.replace("  2, 1, 0, 0", "  1, 1, 0, 0").replace(
      "        ST, SW, 1.35",
      "        ST, NOPE, 1.35",
    );
    const report = validateText("bad.mct", bad);
    const codes = report.diagnostics.map((d) => d.code);
    expect(codes).toContain("MCT-REF-010");
    expect(codes).toContain("MCT-LOAD-010");
  });

  it("rejects empty files safely", () => {
    const report = validateText("empty.mct", "");
    expect(report.fileOk).toBe(false);
    expect(report.diagnostics[0].code).toBe("MCT-SYN-001");
  });
});

describe("compatibility", () => {
  it("flags 2022 constructs against a 2025 target", () => {
    const diags = checkCompatibility(parseMct("2022", GOOD), "2025");
    const codes = diags.map((d) => d.code);
    expect(codes).toContain("MCT-CMP-003"); // LOADCOMB 9-field
    expect(codes).toContain("MCT-CMP-005"); // BEAMLOAD aDir[1]
  });
});

describe("reference fixtures", () => {
  it("validates the 2022 reference with zero errors", () => {
    const report = validateText("reference-2022.mct", ref2022);
    const errors = report.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "loss",
    );
    expect(errors).toEqual([]);
  });

  it("validates the 2025 reference with zero errors", () => {
    const report = validateText("reference-2025.mct", ref2025);
    const errors = report.diagnostics.filter(
      (d) => d.severity === "error" || d.severity === "loss",
    );
    expect(errors).toEqual([]);
  });

});
