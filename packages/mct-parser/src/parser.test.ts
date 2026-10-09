import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMct, getSections, countRecords } from "./parser";
import { serializeMct } from "./serializer";
import { splitFields } from "./lexer";

const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

describe("reference fixtures", () => {
  it("parses the 2022 reference without errors", () => {
    const doc = parseMct("reference-2022.mct", ref2022);
    expect(doc.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(doc.sections).toHaveLength(35);
    expect(doc.lines).toHaveLength(7797);
  });

  it("parses the 2025 reference without errors", () => {
    const doc = parseMct("reference-2025.mct", ref2025);
    expect(doc.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(doc.sections).toHaveLength(35);
    expect(doc.lines).toHaveLength(7810);
  });

  it("round-trips both references byte-identically", () => {
    expect(serializeMct(parseMct("2022", ref2022))).toBe(ref2022);
    expect(serializeMct(parseMct("2025", ref2025))).toBe(ref2025);
  });

  it("groups records per section as inventoried", () => {
    const doc = parseMct("2025", ref2025);
    const count = (name: string): number =>
      getSections(doc, name).reduce((n, s) => n + s.records.length, 0);
    expect(count("NODE")).toBe(1973);
    expect(count("ELEMENT")).toBe(2238);
    expect(count("SECTION")).toBe(148); // 27 DBUSER + 121 TAPERED
    expect(count("DGN-SECT")).toBe(148);
    expect(count("BEAMLOAD")).toBe(1363);
    expect(count("GROUP")).toBe(30);
    expect(count("FRAME-RLS")).toBe(6);
    expect(count("LOADCOMB")).toBe(2);
    expect(count("MATERIAL")).toBe(4);
    expect(count("DGN-MATL")).toBe(4);
    expect(count("ELASTICLINK")).toBe(681);
    expect(count("STLDCASE")).toBe(11);
  });

  it("keeps SECTION MANAGER sections distinct from SECTION", () => {
    const doc = parseMct("2025", ref2025);
    expect(getSections(doc, "SECTION")).toHaveLength(1);
    expect(getSections(doc, "SECTION MANAGER-GROUP & PART")).toHaveLength(1);
    expect(getSections(doc, "SECTION MANAGER-STIFFENER")).toHaveLength(1);
  });

  it("parses USE-STLD occurrences with load-case arguments", () => {
    const doc = parseMct("2025", ref2025);
    const use = getSections(doc, "USE-STLD");
    expect(use).toHaveLength(2);
    expect(use[0].header.args).toEqual(["Girder Weight"]);
    expect(use[1].header.args).toEqual(["SW"]);
  });

  it("counts every data record (no silent loss)", () => {
    for (const [name, text] of [
      ["2022", ref2022],
      ["2025", ref2025],
    ] as const) {
      const doc = parseMct(name, text);
      const dataLines = doc.lines.filter((l) => l.kind === "data").length;
      const covered = doc.sections
        .flatMap((s) => s.records)
        .reduce((n, r) => n + r.lines.length, 0);
      expect(covered).toBe(dataLines);
      // Exact regression anchor: both references carry identical record
      // counts (only line-level edits and comment inserts differ).
      expect(countRecords(doc)).toBe(6827);
    }
  });
});

describe("edge cases", () => {
  it("preserves CRLF and mixed endings losslessly", () => {
    const text = "*VERSION\r\n   9.1.0\r\n\r\n*NODE\n  1, 0, 0, 0\n";
    const doc = parseMct("mixed", text);
    expect(doc.eol).toBe("mixed");
    expect(serializeMct(doc)).toBe(text);
  });

  it("handles a file without trailing newline", () => {
    const text = "*VERSION\n   9.1.0";
    const doc = parseMct("noeol", text);
    expect(serializeMct(doc)).toBe(text);
    expect(doc.lines).toHaveLength(2);
  });

  it("handles an empty file", () => {
    const doc = parseMct("empty", "");
    expect(doc.lines).toHaveLength(0);
    expect(serializeMct(doc)).toBe("");
  });

  it("reports data before any header without throwing", () => {
    const doc = parseMct("orphan", "  1, 2, 3\n*NODE\n  1, 0, 0, 0\n");
    expect(doc.diagnostics.some((d) => d.code === "MCT-PARSE-003")).toBe(true);
    expect(serializeMct(doc)).toBe("  1, 2, 3\n*NODE\n  1, 0, 0, 0\n");
  });

  it("splits fields on commas, trimming whitespace", () => {
    expect(splitFields("  2788, BEAM   , UNILOAD, GZ, NO , NO, ")).toEqual([
      "2788",
      "BEAM",
      "UNILOAD",
      "GZ",
      "NO",
      "NO",
      "",
    ]);
  });

  it("joins GROUP backslash continuations into single records", () => {
    const text = [
      "*GROUP    ; Group",
      "; NAME, NODE_LIST, ELEM_LIST, PLANE_TYPE",
      "   DECK      , , , 0",
      "   GIRDER    , 1to3 \\",
      "        4to6, , , 0",
      "",
    ].join("\n");
    const doc = parseMct("group", text);
    const groups = getSections(doc, "GROUP")[0].records;
    expect(groups).toHaveLength(2);
    expect(groups[1].lines).toHaveLength(2);
    expect(groups[1].logicalLines).toHaveLength(1);
    expect(serializeMct(doc)).toBe(text);
  });

  it("pairs FRAME-RLS records and guards against odd tails", () => {
    const text = [
      "*FRAME-RLS",
      "  3078,  NO, 000011, 0, 0, 0, 0, 0, 0",
      "             000011, 0, 0, 0, 0, 0, 0,",
      "  3604,  NO, 000011, 0, 0, 0, 0, 0, 0",
      "",
    ].join("\n");
    const doc = parseMct("rls", text);
    const records = getSections(doc, "FRAME-RLS")[0].records;
    expect(records).toHaveLength(2);
    expect(records[0].lines).toHaveLength(2);
    expect(records[1].lines).toHaveLength(1);
    expect(doc.diagnostics.some((d) => d.code === "MCT-PARSE-010")).toBe(true);
  });
});
