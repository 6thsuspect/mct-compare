import type {
  CivilVersion,
  ConversionRule,
  MctRecordInput,
  RuleResult,
} from "@mct/shared-types";
import { CIVIL_2022 } from "./adapters/civil-2022";
import { CIVIL_2025 } from "./adapters/civil-2025";

/**
 * Evidence-based conversion rules. Each rule carries a stable id, a single
 * section scope, an explicit confidence, and surgical edits that preserve
 * the surrounding line formatting. Rules never delete unrecognised
 * content: anything they do not understand is returned unchanged.
 */

const noChange = (record: MctRecordInput): RuleResult => ({
  lines: [...record.lines],
  diagnostics: [],
  changed: false,
});

const changed = (
  record: MctRecordInput,
  lines: string[],
): RuleResult => ({
  lines,
  diagnostics: [],
  changed: true,
});

/** Split a line into untrimmed comma segments for surgical edits. */
function segments(line: string): string[] {
  return line.split(",");
}

/** Replace a whole trimmed token inside its segment, keeping padding. */
function swapToken(segment: string, oldToken: string, newToken: string): string {
  const idx = segment.indexOf(oldToken);
  if (idx < 0) return segment;
  return (
    segment.slice(0, idx) + newToken + segment.slice(idx + oldToken.length)
  );
}

// ---------------------------------------------------------------------------
// MCT-CVT-001: *VERSION stamp
// ---------------------------------------------------------------------------

function versionRule(from: CivilVersion, to: CivilVersion): ConversionRule {
  const fromStamp = from === "2022" ? CIVIL_2022.mctVersions[0] : CIVIL_2025.mctVersions[0];
  const toStamp = to === "2022" ? CIVIL_2022.mctVersions[0] : CIVIL_2025.mctVersions[0];
  return {
    id: "MCT-CVT-001",
    from,
    to,
    command: "VERSION",
    description: `Restamp *VERSION ${fromStamp} -> ${toStamp}.`,
    confidence: "verified",
    requiresReview: false,
    apply: (record) => {
      if (record.lines.length !== 1 || !record.lines[0].includes(fromStamp)) {
        return noChange(record);
      }
      return changed(record, [record.lines[0].replace(fromStamp, toStamp)]);
    },
  };
}

// ---------------------------------------------------------------------------
// MCT-CVT-002: TAPERED bHUMBLY flag (SECTION / DGN-SECT)
// Layout (0-based fields): iSEC, TYPE, SNAME, OFFSET(3..11), bSD(12),
// bWE(13), [bHUMBLY(14) in 2025], SHAPE, iyVAR, izVAR, STYPE.
// ---------------------------------------------------------------------------

function taperedRule(
  id: string,
  from: CivilVersion,
  to: CivilVersion,
  command: string,
): ConversionRule {
  const forward = from === "2022" && to === "2025";
  return {
    id,
    from,
    to,
    command,
    description: forward
      ? "Insert bHUMBLY=NO before SHAPE on TAPERED records (2025 schema)."
      : "Remove the bHUMBLY column from TAPERED records (2022 schema).",
    confidence: "verified",
    requiresReview: false,
    apply: (record) => {
      if (record.fields[1]?.toUpperCase() !== "TAPERED") return noChange(record);
      const segs = segments(record.lines[0]);
      if (forward) {
        if (record.fields.length !== 18) return noChange(record);
        return changed(record, [
          [...segs.slice(0, 14), " NO", ...segs.slice(14)].join(","),
          ...record.lines.slice(1),
        ]);
      }
      if (record.fields.length === 18) return noChange(record); // already 2022
      if (record.fields.length !== 19) return noChange(record);
      if (record.fields[14] !== "NO") {
        return {
          lines: [...record.lines],
          changed: false,
          diagnostics: [
            {
              code: "MCT-CVT-002-LOSS",
              ruleId: id,
              severity: "loss",
              message: `TAPERED record has bHUMBLY=${record.fields[14]} which the 2022 schema cannot represent; record left unchanged.`,
              section: record.section,
              line: record.startLine,
              hint: "Resolve the bHUMBLY setting in the 2025 model before downgrading.",
            },
          ],
        };
      }
      return changed(record, [
        [...segs.slice(0, 14), ...segs.slice(15)].join(","),
        ...record.lines.slice(1),
      ]);
    },
  };
}

// ---------------------------------------------------------------------------
// MCT-CVT-003: BEAMLOAD ECCDIR spelling aDir[1] <-> LY (provisional)
// ---------------------------------------------------------------------------

function beamloadRule(from: CivilVersion, to: CivilVersion): ConversionRule {
  const forward = from === "2022" && to === "2025";
  const oldToken = forward ? "aDir[1]" : "LY";
  const newToken = forward ? "LY" : "aDir[1]";
  return {
    id: "MCT-CVT-003",
    from,
    to,
    command: "BEAMLOAD",
    description: forward
      ? "Respell BEAMLOAD ECCDIR aDir[1] -> LY. Provisional: uniform across all 1363 reference rows but undocumented in schema comments."
      : "Respell BEAMLOAD ECCDIR LY -> aDir[1]. Provisional: see forward evidence note.",
    confidence: "provisional",
    requiresReview: true,
    apply: (record) => {
      if (record.fields[6] !== oldToken) return noChange(record);
      const segs = segments(record.lines[0]);
      segs[6] = swapToken(segs[6], oldToken, newToken);
      return changed(record, [segs.join(","), ...record.lines.slice(1)]);
    },
  };
}

// ---------------------------------------------------------------------------
// MCT-CVT-004: LOADCOMB LcomFactor column
// ---------------------------------------------------------------------------

function loadcombRule(from: CivilVersion, to: CivilVersion): ConversionRule {
  const forward = from === "2022" && to === "2025";
  return {
    id: "MCT-CVT-004",
    from,
    to,
    command: "LOADCOMB",
    description: forward
      ? "Append LcomFactor=1 to LOADCOMB NAME headers (2025 schema)."
      : "Drop the LcomFactor column from LOADCOMB NAME headers (2022 schema).",
    confidence: "verified",
    requiresReview: false,
    apply: (record) => {
      if (!/^\s*NAME\s*=/i.test(record.lines[0] ?? "")) return noChange(record);
      const n = record.fields.length;
      if (forward) {
        if (n !== 9) return noChange(record);
        return changed(record, [`${record.lines[0]}, 1`, ...record.lines.slice(1)]);
      }
      if (n === 9) return noChange(record); // already 2022
      if (n !== 10) return noChange(record);
      if (record.fields[9] !== "1") {
        return {
          lines: [...record.lines],
          changed: false,
          diagnostics: [
            {
              code: "MCT-CVT-004-LOSS",
              ruleId: "MCT-CVT-004",
              severity: "loss",
              message: `LOADCOMB header has LcomFactor=${record.fields[9]} which the 2022 schema cannot represent; record left unchanged.`,
              section: record.section,
              line: record.startLine,
              hint: "Normalise LcomFactor to 1 in the 2025 model before downgrading.",
            },
          ],
        };
      }
      return changed(record, [
        record.lines[0].replace(/,\s*1\s*$/, ""),
        ...record.lines.slice(1),
      ]);
    },
  };
}

// ---------------------------------------------------------------------------
// MCT-CVT-005: DGN-MATL STEEL trailing flag (provisional)
// Observed: 69-field STEEL rows gain a trailing "NO" column (70 fields).
// The column is undocumented in schema comments, hence provisional.
// ---------------------------------------------------------------------------

function dgnMatlRule(from: CivilVersion, to: CivilVersion): ConversionRule {
  const forward = from === "2022" && to === "2025";
  return {
    id: "MCT-CVT-005",
    from,
    to,
    command: "DGN-MATL",
    description: forward
      ? 'Append trailing "NO" to 69-field DGN-MATL STEEL rows. Provisional: observed on all reference STEEL rows but undocumented.'
      : 'Drop the trailing "NO" column from 70-field DGN-MATL STEEL rows. Provisional.',
    confidence: "provisional",
    requiresReview: true,
    apply: (record) => {
      if (record.fields[1]?.toUpperCase() !== "STEEL") return noChange(record);
      const line = record.lines[0];
      if (forward) {
        if (record.fields.length === 70) return noChange(record); // done
        if (record.fields.length !== 69) return noChange(record);
        if (!/,\s*$/.test(line)) return noChange(record);
        return changed(record, [
          `${line.replace(/,\s*$/, "")},NO,`,
          ...record.lines.slice(1),
        ]);
      }
      if (record.fields.length === 69) return noChange(record); // done
      if (record.fields.length !== 70) return noChange(record);
      if (record.fields[68] !== "NO") {
        return {
          lines: [...record.lines],
          changed: false,
          diagnostics: [
            {
              code: "MCT-CVT-005-LOSS",
              ruleId: "MCT-CVT-005",
              severity: "loss",
              message: `DGN-MATL STEEL row has trailing flag ${record.fields[68]} which the 2022 schema cannot represent; record left unchanged.`,
              section: record.section,
              line: record.startLine,
            },
          ],
        };
      }
      return changed(record, [
        line.replace(/,NO,\s*$/, ","),
        ...record.lines.slice(1),
      ]);
    },
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export function buildRules(from: CivilVersion, to: CivilVersion): ConversionRule[] {
  if (from === to) return [];
  return [
    versionRule(from, to),
    taperedRule("MCT-CVT-002A", from, to, "SECTION"),
    taperedRule("MCT-CVT-002B", from, to, "DGN-SECT"),
    beamloadRule(from, to),
    loadcombRule(from, to),
    dgnMatlRule(from, to),
  ];
}
