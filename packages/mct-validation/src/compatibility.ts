import {
  getSections,
  serializeMct,
  splitFields,
  type MctDocument,
} from "@mct/parser";
import type { CivilVersion, Diagnostic } from "@mct/shared-types";
import { KNOWN_SECTIONS } from "./syntax";

/**
 * Target-version compatibility: flags constructs the target generation
 * cannot represent natively, each mapped to the conversion rule (if any)
 * that resolves it. Errors = convertible automatically or blocking;
 * warnings = need review; info = restamps / unverified content.
 */
export function checkCompatibility(
  doc: MctDocument,
  target: CivilVersion,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const push = (d: Diagnostic): void => {
    out.push(d);
  };

  if (target === "2025") {
    checkTapered(doc, 18, "2025", "MCT-CVT-002", push);
    checkLoadcomb(doc, 9, "2025", "MCT-CVT-004", push);
    checkBeamload(doc, "aDir[1]", "2025", push);
    checkDgnMatl(doc, 69, "2025", push);
    checkVersionStamp(doc, "9.6", "2025", push);
  } else {
    checkTaperedDowngrade(doc, push);
    checkLoadcombDowngrade(doc, push);
    checkBeamload(doc, "LY", "2022", push);
    checkDgnMatlDowngrade(doc, push);
    checkVersionStamp(doc, "9.1", "2022", push);
  }

  for (const section of doc.sections) {
    if (!KNOWN_SECTIONS.has(section.header.name)) {
      push({
        code: "MCT-CMP-010",
        severity: "info",
        message: `Section *${section.header.name} is not recognised; target acceptance is unverified.`,
        section: section.header.name,
        line: section.startLine,
      });
    }
  }
  return out;
}

function checkTapered(
  doc: MctDocument,
  width: number,
  target: CivilVersion,
  ruleId: string,
  push: (d: Diagnostic) => void,
): void {
  let count = 0;
  let firstLine: number | undefined;
  for (const name of ["SECTION", "DGN-SECT"]) {
    for (const section of getSections(doc, name)) {
      for (const record of section.records) {
        const fields = splitFields(record.lines[0] ?? "");
        if (fields[1]?.toUpperCase() !== "TAPERED") continue;
        if (fields.length === width) {
          count += 1;
          firstLine ??= record.startLine;
        }
      }
    }
  }
  if (count > 0) {
    push({
      code: "MCT-CMP-001",
      severity: "error",
      message: `${count} TAPERED record(s) use the ${width}-field layout, which ${target} does not accept; rule ${ruleId} converts them automatically.`,
      line: firstLine,
      hint: `Run conversion with rule ${ruleId}.`,
    });
  }
}

function checkTaperedDowngrade(
  doc: MctDocument,
  push: (d: Diagnostic) => void,
): void {
  let convertible = 0;
  let blocking = 0;
  let firstLine: number | undefined;
  for (const name of ["SECTION", "DGN-SECT"]) {
    for (const section of getSections(doc, name)) {
      for (const record of section.records) {
        const fields = splitFields(record.lines[0] ?? "");
        if (fields[1]?.toUpperCase() !== "TAPERED" || fields.length !== 19) {
          continue;
        }
        firstLine ??= record.startLine;
        if (fields[14] === "NO") convertible += 1;
        else blocking += 1;
      }
    }
  }
  if (convertible > 0) {
    push({
      code: "MCT-CMP-001",
      severity: "error",
      message: `${convertible} TAPERED record(s) use the 19-field layout, which 2022 does not accept; rule MCT-CVT-002 converts them automatically.`,
      line: firstLine,
    });
  }
  if (blocking > 0) {
    push({
      code: "MCT-CMP-002",
      severity: "loss",
      message: `${blocking} TAPERED record(s) carry bHUMBLY<>NO, which the 2022 schema cannot represent. Resolve in the 2025 model first.`,
      line: firstLine,
    });
  }
}

function checkLoadcomb(
  doc: MctDocument,
  width: number,
  target: CivilVersion,
  ruleId: string,
  push: (d: Diagnostic) => void,
): void {
  let count = 0;
  let firstLine: number | undefined;
  for (const section of getSections(doc, "LOADCOMB")) {
    for (const record of section.records) {
      if (!/^\s*NAME\s*=/i.test(record.lines[0] ?? "")) continue;
      if (splitFields(record.lines[0] ?? "").length === width) {
        count += 1;
        firstLine ??= record.startLine;
      }
    }
  }
  if (count > 0) {
    push({
      code: "MCT-CMP-003",
      severity: "error",
      message: `${count} LOADCOMB header(s) use the ${width}-field layout, which ${target} does not accept; rule ${ruleId} converts them automatically.`,
      line: firstLine,
    });
  }
}

function checkLoadcombDowngrade(
  doc: MctDocument,
  push: (d: Diagnostic) => void,
): void {
  let convertible = 0;
  let blocking = 0;
  let firstLine: number | undefined;
  for (const section of getSections(doc, "LOADCOMB")) {
    for (const record of section.records) {
      if (!/^\s*NAME\s*=/i.test(record.lines[0] ?? "")) continue;
      const fields = splitFields(record.lines[0] ?? "");
      if (fields.length !== 10) continue;
      firstLine ??= record.startLine;
      if (fields[9] === "1") convertible += 1;
      else blocking += 1;
    }
  }
  if (convertible > 0) {
    push({
      code: "MCT-CMP-003",
      severity: "error",
      message: `${convertible} LOADCOMB header(s) carry LcomFactor, which 2022 does not accept; rule MCT-CVT-004 converts them automatically.`,
      line: firstLine,
    });
  }
  if (blocking > 0) {
    push({
      code: "MCT-CMP-004",
      severity: "loss",
      message: `${blocking} LOADCOMB header(s) carry LcomFactor<>1, which the 2022 schema cannot represent.`,
      line: firstLine,
    });
  }
}

function checkBeamload(
  doc: MctDocument,
  token: string,
  target: CivilVersion,
  push: (d: Diagnostic) => void,
): void {
  let count = 0;
  let firstLine: number | undefined;
  for (const section of getSections(doc, "BEAMLOAD")) {
    for (const record of section.records) {
      if (splitFields(record.lines[0] ?? "")[6] === token) {
        count += 1;
        firstLine ??= record.startLine;
      }
    }
  }
  if (count > 0) {
    push({
      code: "MCT-CMP-005",
      severity: "warning",
      message:
        `${count} BEAMLOAD record(s) spell ECCDIR as ${token}, which differs from the ${target} reference spelling; ` +
        `provisional rule MCT-CVT-003 covers this mapping and needs explicit review.`,
      line: firstLine,
      hint: "Enable provisional rules only after engineering review.",
    });
  }
}

function checkDgnMatl(
  doc: MctDocument,
  width: number,
  target: CivilVersion,
  push: (d: Diagnostic) => void,
): void {
  let count = 0;
  let firstLine: number | undefined;
  for (const section of getSections(doc, "DGN-MATL")) {
    for (const record of section.records) {
      const fields = splitFields(record.lines[0] ?? "");
      if (fields[1]?.toUpperCase() !== "STEEL") continue;
      if (fields.length === width) {
        count += 1;
        firstLine ??= record.startLine;
      }
    }
  }
  if (count > 0) {
    push({
      code: "MCT-CMP-006",
      severity: "warning",
      message:
        `${count} DGN-MATL STEEL row(s) use the ${width}-field layout, which differs from the ${target} reference layout; ` +
        `provisional rule MCT-CVT-005 covers this mapping and needs explicit review.`,
      line: firstLine,
    });
  }
}

function checkDgnMatlDowngrade(
  doc: MctDocument,
  push: (d: Diagnostic) => void,
): void {
  let convertible = 0;
  let blocking = 0;
  let firstLine: number | undefined;
  for (const section of getSections(doc, "DGN-MATL")) {
    for (const record of section.records) {
      const fields = splitFields(record.lines[0] ?? "");
      if (fields[1]?.toUpperCase() !== "STEEL" || fields.length !== 70) {
        continue;
      }
      firstLine ??= record.startLine;
      if (fields[68] === "NO") convertible += 1;
      else blocking += 1;
    }
  }
  if (convertible > 0) {
    push({
      code: "MCT-CMP-006",
      severity: "warning",
      message: `${convertible} DGN-MATL STEEL row(s) use the 70-field layout; provisional rule MCT-CVT-005 covers the downgrade and needs explicit review.`,
      line: firstLine,
    });
  }
  if (blocking > 0) {
    push({
      code: "MCT-CMP-007",
      severity: "loss",
      message: `${blocking} DGN-MATL STEEL row(s) carry a trailing flag<>NO, which the 2022 schema cannot represent.`,
      line: firstLine,
    });
  }
}

function checkVersionStamp(
  doc: MctDocument,
  wantPrefix: string,
  target: CivilVersion,
  push: (d: Diagnostic) => void,
): void {
  for (const section of getSections(doc, "VERSION")) {
    const stamp = section.records[0]?.lines[0]?.trim() ?? "";
    if (stamp !== "" && !stamp.startsWith(wantPrefix)) {
      push({
        code: "MCT-CMP-008",
        severity: "info",
        message: `*VERSION stamp ${stamp} will be restamped for ${target}; rule MCT-CVT-001.`,
        section: "VERSION",
        line: section.startLine + 1,
      });
    }
  }
}
