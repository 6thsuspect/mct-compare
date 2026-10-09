import { readFileSync } from "node:fs";
import { parseMct } from "@mct/parser";
import { describe, expect, it } from "vitest";
import { buildModel, semanticAtLine } from "./model";
import { diffModels } from "./semantic-diff";

const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

describe("semantic diff basics", () => {
  const base = [
    "*NODE",
    "; iNO, X, Y, Z",
    "  101, 0.0, 0.0, 0.0",
    "  102, 1, 0, 0",
    "",
  ].join("\n");

  it("treats formatting-only edits as equivalent", () => {
    const a = parseMct("a", base);
    const b = parseMct(
      "b",
      base.replace("  101, 0.0, 0.0, 0.0", "101,0.0,0.0,0.0"),
    );
    const r = diffModels(buildModel(a), buildModel(b));
    expect(r.summary).toMatchObject({
      equivalent: 2,
      modified: 0,
      added: 0,
      removed: 0,
    });
  });

  it("detects a changed node coordinate", () => {
    const a = parseMct("a", base);
    const b = parseMct("b", base.replace("  102, 1, 0, 0", "  102, 2, 0, 0"));
    const r = diffModels(buildModel(a), buildModel(b));
    expect(r.summary.modified).toBe(1);
    const change = r.changes[0];
    expect(change.label).toBe("NODE 102");
    expect(change.fields).toEqual([{ field: "x", before: "1", after: "2" }]);
  });

  it("detects added and removed records by key, not position", () => {
    const a = parseMct("a", base);
    const b = parseMct(
      "b",
      base.replace("  101, 0.0, 0.0, 0.0\n", "") + "  103, 5, 5, 5\n",
    );
    const r = diffModels(buildModel(a), buildModel(b));
    expect(r.summary).toMatchObject({ removed: 1, added: 1, modified: 0 });
    expect(r.changes.map((c) => `${c.status}:${c.label}`).sort()).toEqual([
      "added:NODE 103",
      "removed:NODE 101",
    ]);
  });

  it("marks unknown sections as unclassified, never equivalent", () => {
    const a = parseMct("a", "*FUTURE-CMD\n  1, 2, 3\n");
    const b = parseMct("b", "*FUTURE-CMD\n  1, 2, 4\n");
    const r = diffModels(buildModel(a), buildModel(b));
    expect(r.summary.unclassified).toBe(1);
    expect(r.summary.equivalent).toBe(0);
    expect(r.changes[0].status).toBe("unclassified");
  });

  it("links source lines back to semantic records", () => {
    const model = buildModel(parseMct("a", base));
    expect(semanticAtLine(model, 3)?.label).toBe("NODE 101");
    expect(semanticAtLine(model, 4)?.label).toBe("NODE 102");
    expect(semanticAtLine(model, 1)).toBeUndefined();
  });
});

describe("reference fixtures", () => {
  it("reports exactly the evidenced engineering changes", () => {
    const a = buildModel(parseMct("2022", ref2022));
    const b = buildModel(parseMct("2025", ref2025));
    const r = diffModels(a, b);
    // 121 SECTION TAPERED + 121 DGN-SECT TAPERED + 1363 BEAMLOAD
    // + 2 LOADCOMB + 3 DGN-MATL + 1 VERSION = 1611
    expect(r.summary).toMatchObject({
      modified: 1611,
      added: 0,
      removed: 0,
      unclassified: 0,
    });
    const bySection = new Map<string, number>();
    for (const c of r.changes) {
      bySection.set(c.section, (bySection.get(c.section) ?? 0) + 1);
    }
    expect(bySection.get("SECTION")).toBe(121);
    expect(bySection.get("DGN-SECT")).toBe(121);
    expect(bySection.get("BEAMLOAD")).toBe(1363);
    expect(bySection.get("LOADCOMB")).toBe(2);
    expect(bySection.get("DGN-MATL")).toBe(3);
    expect(bySection.get("VERSION")).toBe(1);
  });

  it("shows the BEAMLOAD change as an ECCDIR field edit", () => {
    const a = buildModel(parseMct("2022", ref2022));
    const b = buildModel(parseMct("2025", ref2025));
    const r = diffModels(a, b);
    const beam = r.changes.find((c) => c.label === "BEAMLOAD 2788");
    expect(beam?.fields).toEqual([
      { field: "eccdir", before: "aDir[1]", after: "LY" },
    ]);
  });
});
