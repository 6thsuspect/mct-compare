import { readFileSync } from "node:fs";
import { convertDocument } from "@mct/converter";
import { parseMct } from "@mct/parser";
import { checkCompatibility, validateText } from "@mct/validation";
import { describe, expect, it } from "vitest";

const ref2022 = readFileSync("fixtures/reference-2022.mct", "utf8");
const ref2025 = readFileSync("fixtures/reference-2025.mct", "utf8");

describe("reference validation", () => {
  it("accepts both references with zero errors", () => {
    for (const [name, text] of [
      ["reference-2022.mct", ref2022],
      ["reference-2025.mct", ref2025],
    ] as const) {
      const report = validateText(name, text);
      expect(report.fileOk).toBe(true);
      expect(
        report.diagnostics.filter(
          (d) => d.severity === "error" || d.severity === "loss",
        ),
      ).toEqual([]);
    }
  });

  it("flags the 2022 reference against a 2025 target", () => {
    const diags = checkCompatibility(parseMct("2022", ref2022), "2025");
    const codes = diags.map((d) => d.code);
    expect(codes).toContain("MCT-CMP-001"); // TAPERED width
    expect(codes).toContain("MCT-CMP-003"); // LOADCOMB width
    expect(codes).toContain("MCT-CMP-005"); // BEAMLOAD provisional
    expect(codes).toContain("MCT-CMP-006"); // DGN-MATL provisional
  });

  it("clears compatibility after conversion", () => {
    const converted = convertDocument(parseMct("2022", ref2022), {
      from: "2022",
      to: "2025",
      includeProvisional: true,
    });
    expect(converted.output).toBeDefined();
    const diags = checkCompatibility(
      parseMct("converted", converted.output ?? ""),
      "2025",
    );
    expect(
      diags.filter((d) => d.severity === "error" || d.severity === "loss"),
    ).toEqual([]);
  });
});
