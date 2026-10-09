import {
  countRecords,
  parseMct,
  serializeMct,
  type MctDocument,
} from "@mct/parser";
import type {
  CivilVersion,
  Diagnostic,
  ValidationReport,
} from "@mct/shared-types";
import { checkCompatibility } from "./compatibility";
import { countBySeverity } from "./diagnostics";
import { validateReferences } from "./references";
import { validateSyntax } from "./syntax";

export * from "./syntax";
export * from "./references";
export * from "./compatibility";
export * from "./diagnostics";

export interface ValidateOptions {
  targetVersion?: CivilVersion;
}

/**
 * Validate raw MCT text end to end: parse (level 1), model references
 * (level 2) and, optionally, target-version compatibility.
 */
export function validateText(
  fileName: string,
  text: string,
  options: ValidateOptions = {},
): ValidationReport {
  let doc: MctDocument;
  let fileOk = true;
  try {
    doc = parseMct(fileName, text);
  } catch (err) {
    fileOk = false;
    const diagnostics: Diagnostic[] = [
      {
        code: "MCT-SYN-000",
        severity: "error",
        message: `Parser crashed: ${err instanceof Error ? err.message : String(err)}`,
      },
    ];
    return {
      file: fileName,
      detectedVersion: "unknown",
      targetVersion: options.targetVersion,
      fileOk,
      stats: { lines: 0, sections: 0, records: 0, bytes: text.length },
      diagnostics,
      counts: countBySeverity(diagnostics),
    };
  }

  const diagnostics: Diagnostic[] = [
    ...validateSyntax(doc),
    ...validateReferences(doc),
  ];
  if (options.targetVersion) {
    diagnostics.push(...checkCompatibility(doc, options.targetVersion));
  }
  if (diagnostics.some((d) => d.severity === "error" && d.code.startsWith("MCT-SYN"))) {
    fileOk = fileOk && !diagnostics.some((d) => d.code === "MCT-SYN-001" || d.code === "MCT-SYN-002");
  }

  // Round-trip integrity: the parser must be lossless.
  if (serializeMct(doc) !== text) {
    diagnostics.push({
      code: "MCT-SYN-020",
      severity: "error",
      message: "Internal error: parse/serialize round-trip is not lossless.",
    });
  }

  return {
    file: fileName,
    detectedVersion: detectVersionLabel(doc),
    targetVersion: options.targetVersion,
    fileOk,
    stats: {
      lines: doc.lines.length,
      sections: doc.sections.length,
      records: countRecords(doc),
      bytes: text.length,
    },
    diagnostics,
    counts: countBySeverity(diagnostics),
  };
}

/** Version label without depending on the converter package. */
function detectVersionLabel(doc: MctDocument): ValidationReport["detectedVersion"] {
  const stamp =
    doc.sections
      .find((s) => s.header.name === "VERSION")
      ?.records[0]?.lines[0]?.trim() ?? "";
  if (stamp.startsWith("9.1")) return "2022";
  if (stamp.startsWith("9.6")) return "2025";
  return "unknown";
}
