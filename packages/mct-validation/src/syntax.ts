import type { MctDocument } from "@mct/parser";
import type { Diagnostic } from "@mct/shared-types";

/** Sections recognised by this tool (see docs/command-inventory.md). */
export const KNOWN_SECTIONS: ReadonlySet<string> = new Set([
  "VERSION",
  "UNIT",
  "PROJINFO",
  "STRUCTYPE",
  "REBAR-MATL-CODE",
  "NODE",
  "ELEMENT",
  "GROUP",
  "BNDR-GROUP",
  "LOAD-GROUP",
  "MATERIAL",
  "MATL-COLOR",
  "SECT-COLOR",
  "SECTION",
  "COMP-GEN-SECT-PSC-DESIGN",
  "DGN-SECT",
  "STLDCASE",
  "DGN-STEEL",
  "CONSTRAINT",
  "SPRING",
  "ELASTICLINK",
  "FRAME-RLS",
  "LOADTOMASS",
  "USE-STLD",
  "BEAMLOAD",
  "SELFWEIGHT",
  "LOADCOMB",
  "LC-COLOR",
  "DGN-MATL",
  "LENGTH",
  "LIMITSRATIO",
  "SECTION MANAGER-GROUP & PART",
  "SECTION MANAGER-STIFFENER",
  "ENDDATA",
]);

/** Level-1 checks: file structure, parser diagnostics, unknown sections. */
export function validateSyntax(doc: MctDocument): Diagnostic[] {
  const out: Diagnostic[] = [];

  if (doc.lines.length === 0) {
    out.push({
      code: "MCT-SYN-001",
      severity: "error",
      message: "File is empty.",
    });
    return out;
  }
  if (doc.sections.length === 0) {
    out.push({
      code: "MCT-SYN-002",
      severity: "error",
      message: "No section headers found.",
    });
    return out;
  }

  out.push(...doc.diagnostics);

  const names = new Set(doc.sections.map((s) => s.header.name));
  if (!names.has("ENDDATA")) {
    out.push({
      code: "MCT-SYN-003",
      severity: "warning",
      message: "Missing *ENDDATA terminator.",
      hint: "A well-formed MCT file ends with *ENDDATA.",
    });
  }
  if (!names.has("VERSION")) {
    out.push({
      code: "MCT-SYN-004",
      severity: "warning",
      message: "Missing *VERSION section; version detection falls back to schema heuristics.",
    });
  }
  for (const section of doc.sections) {
    if (!KNOWN_SECTIONS.has(section.header.name)) {
      out.push({
        code: "MCT-SYN-010",
        severity: "info",
        message: `Unrecognised section *${section.header.name}; content is preserved but unverified.`,
        section: section.header.name,
        line: section.startLine,
      });
    }
  }
  return out;
}
