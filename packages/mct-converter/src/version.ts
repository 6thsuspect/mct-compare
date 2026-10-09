import { getSections, splitFields, type MctDocument } from "@mct/parser";
import type { CivilVersion, DetectedVersion } from "@mct/shared-types";
import { CIVIL_2022 } from "./adapters/civil-2022";
import { CIVIL_2025 } from "./adapters/civil-2025";

export interface VersionDetection {
  version: DetectedVersion;
  /** Raw `*VERSION` stamp when present. */
  versionString?: string;
  /** Human-readable evidence trail. */
  evidence: string[];
}

export function adapterFor(version: CivilVersion) {
  return version === "2022" ? CIVIL_2022 : CIVIL_2025;
}

/**
 * Recognise the source generation. The `*VERSION` stamp wins when known;
 * otherwise independent schema heuristics vote (TAPERED width, BEAMLOAD
 * ECCDIR spelling, LOADCOMB width). Conflicting votes yield "unknown".
 */
export function detectVersion(doc: MctDocument): VersionDetection {
  const evidence: string[] = [];
  const votes = new Map<CivilVersion, number>();
  const vote = (v: CivilVersion, why: string): void => {
    votes.set(v, (votes.get(v) ?? 0) + 1);
    evidence.push(why);
  };

  const versionSections = getSections(doc, "VERSION");
  const versionString = versionSections[0]?.records[0]?.lines[0]?.trim();
  if (versionString) {
    if (CIVIL_2022.mctVersions.some((s) => versionString.startsWith(prefix(s)))) {
      return { version: "2022", versionString, evidence: [`*VERSION stamp ${versionString}`] };
    }
    if (CIVIL_2025.mctVersions.some((s) => versionString.startsWith(prefix(s)))) {
      return { version: "2025", versionString, evidence: [`*VERSION stamp ${versionString}`] };
    }
    evidence.push(`Unknown *VERSION stamp ${versionString}; falling back to schema heuristics.`);
  } else {
    evidence.push("No *VERSION section; falling back to schema heuristics.");
  }

  voteTaperedWidth(doc, vote);
  voteBeamloadEccdir(doc, vote);
  voteLoadcombWidth(doc, vote);

  const v2022 = votes.get("2022") ?? 0;
  const v2025 = votes.get("2025") ?? 0;
  if (v2022 === 0 && v2025 === 0) {
    evidence.push("No version-discriminating schema evidence found.");
    return { version: "unknown", versionString, evidence };
  }
  if (v2022 > 0 && v2025 > 0) {
    evidence.push("Conflicting schema evidence; version unknown.");
    return { version: "unknown", versionString, evidence };
  }
  return {
    version: v2025 > 0 ? "2025" : "2022",
    versionString,
    evidence,
  };
}

type Vote = (v: CivilVersion, why: string) => void;

/** TAPERED first-line width: 18 fields (2022) vs 19 (2025, bHUMBLY). */
function voteTaperedWidth(doc: MctDocument, vote: Vote): void {
  for (const name of ["SECTION", "DGN-SECT"]) {
    for (const section of getSections(doc, name)) {
      for (const record of section.records) {
        const fields = splitFields(record.lines[0] ?? "");
        if (fields[1]?.toUpperCase() !== "TAPERED") continue;
        if (fields.length === 19) {
          vote("2025", `${name} TAPERED record with 19 fields (bHUMBLY present).`);
        } else if (fields.length === 18) {
          vote("2022", `${name} TAPERED record with 18 fields (no bHUMBLY).`);
        }
        return;
      }
    }
  }
}

/** BEAMLOAD ECCDIR spelling: aDir[1] (2022) vs LY (2025). */
function voteBeamloadEccdir(doc: MctDocument, vote: Vote): void {
  for (const section of getSections(doc, "BEAMLOAD")) {
    for (const record of section.records) {
      const fields = splitFields(record.lines[0] ?? "");
      if (fields[6] === "aDir[1]") {
        vote("2022", "BEAMLOAD ECCDIR spelled aDir[1].");
        return;
      }
      if (fields[6] === "LY") {
        vote("2025", "BEAMLOAD ECCDIR spelled LY.");
        return;
      }
    }
  }
}

/** LOADCOMB header width: 9 fields (2022) vs 10 (2025, LcomFactor). */
function voteLoadcombWidth(doc: MctDocument, vote: Vote): void {
  for (const section of getSections(doc, "LOADCOMB")) {
    for (const record of section.records) {
      if (!/^\s*NAME\s*=/i.test(record.lines[0] ?? "")) continue;
      const fields = splitFields(record.lines[0] ?? "");
      if (fields.length >= 10) {
        vote("2025", "LOADCOMB header with 10 fields (LcomFactor present).");
        return;
      }
      if (fields.length === 9) {
        vote("2022", "LOADCOMB header with 9 fields (no LcomFactor).");
        return;
      }
    }
  }
}

/** Major.minor prefix of a stamp, e.g. "9.1.0" -> "9.1". */
function prefix(stamp: string): string {
  return stamp.split(".").slice(0, 2).join(".");
}
