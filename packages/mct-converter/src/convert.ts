import {
  serializeMct,
  serializeWithEdits,
  splitFields,
  type MctDocument,
} from "@mct/parser";
import type {
  AuditEntry,
  CivilVersion,
  ConversionDiagnostic,
  ConversionOptions,
  ConversionReport,
  MctRecordInput,
} from "@mct/shared-types";
import { COMMENT_RULE_ID, commentPatches } from "./comment-patches";
import { getRules } from "./registry";
import { adapterFor, detectVersion } from "./version";

/**
 * Convert a parsed document from one CIVIL generation to another.
 *
 * Guarantees:
 * - the input document is never mutated;
 * - records no rule understands are preserved verbatim;
 * - provisional rules only run with explicit opt-in;
 * - every change is recorded in the audit trail.
 */
export function convertDocument(
  doc: MctDocument,
  options: ConversionOptions,
): ConversionReport {
  const { from, to } = options;
  const includeProvisional = options.includeProvisional ?? false;
  const refreshComments = options.refreshComments ?? false;

  const diagnostics: ConversionDiagnostic[] = [];
  const applied: AuditEntry[] = [];
  const skippedProvisional: AuditEntry[] = [];

  const detected = detectVersion(doc);
  if (detected.version !== "unknown" && detected.version !== from) {
    diagnostics.push({
      code: "MCT-CONV-010",
      ruleId: "*",
      severity: "warning",
      message: `Source detected as ${adapterFor(detected.version).label} but conversion was requested from ${adapterFor(from).label}. Proceeding with the requested source version.`,
      hint: "Verify the source file or swap the conversion direction.",
    });
  }

  if (from === to) {
    diagnostics.push({
      code: "MCT-CONV-001",
      ruleId: "*",
      severity: "info",
      message: "Source and target versions are identical; nothing to convert.",
    });
    return {
      from,
      to,
      detectedSourceVersion: detected.version,
      recordsExamined: 0,
      recordsChanged: 0,
      applied,
      skippedProvisional,
      diagnostics,
      ok: true,
      output: options.dryRun ? undefined : serializeMct(doc),
    };
  }

  const rules = getRules(from, to);
  if (rules.length === 0) {
    diagnostics.push({
      code: "MCT-CONV-002",
      ruleId: "*",
      severity: "error",
      message: `Unsupported conversion direction ${from} -> ${to}.`,
    });
    return {
      from,
      to,
      detectedSourceVersion: detected.version,
      recordsExamined: 0,
      recordsChanged: 0,
      applied,
      skippedProvisional,
      diagnostics,
      ok: false,
    };
  }

  const replacements = new Map<number, string[]>();
  const insertionsAfter = new Map<number, string[]>();
  const removals = new Set<number>();
  const skippedByRule = new Map<string, { section: string; count: number }>();

  let recordsExamined = 0;
  let recordsChanged = 0;

  for (const section of doc.sections) {
    const scoped = rules.filter((r) => r.command === section.header.name);
    for (const record of section.records) {
      recordsExamined += 1;
      let current = [...record.lines];
      let changedBy: string | null = null;
      for (const rule of scoped) {
        const input = toRuleInput(
          record.section,
          record.index,
          record.startLine,
          record.endLine,
          current,
        );
        if (rule.requiresReview && !includeProvisional) {
          // Probe: would this rule change the record?
          const probe = rule.apply(input);
          if (probe.changed) {
            const entry = skippedByRule.get(rule.id) ?? {
              section: record.section,
              count: 0,
            };
            entry.count += 1;
            skippedByRule.set(rule.id, entry);
          }
          for (const d of probe.diagnostics) diagnostics.push(withLine(d, record.startLine));
          continue;
        }
        const result = rule.apply(input);
        for (const d of result.diagnostics) diagnostics.push(withLine(d, record.startLine));
        if (result.changed) {
          current = [...result.lines];
          changedBy = rule.id;
        }
      }
      if (changedBy) {
        recordsChanged += 1;
        replacements.set(record.startLine, current);
        const rule = rules.find((r) => r.id === changedBy);
        applied.push({
          ruleId: changedBy,
          section: record.section,
          startLine: record.startLine,
          endLine: record.endLine,
          before: [...record.lines],
          after: [...current],
          severity: rule?.confidence === "provisional" ? "warning" : "info",
          message: rule?.description ?? "Record converted.",
        });
      }
    }
  }

  for (const [ruleId, { section, count }] of skippedByRule) {
    const rule = rules.find((r) => r.id === ruleId);
    skippedProvisional.push({
      ruleId,
      section,
      startLine: 0,
      endLine: 0,
      before: [],
      after: [],
      severity: "warning",
      message:
        `Provisional rule ${ruleId} skipped for ${count} record(s) pending review: ` +
        (rule?.description ?? ""),
      count,
    });
  }

  if (refreshComments) {
    applyCommentPatches(doc, from, to, {
      replacements,
      insertionsAfter,
      removals,
      applied,
      diagnostics,
    });
  }

  const preserved = recordsExamined - recordsChanged;
  diagnostics.push({
    code: "MCT-CONV-100",
    ruleId: "*",
    severity: "info",
    message: `${preserved} of ${recordsExamined} record(s) preserved without transformation.`,
  });

  const blocked = diagnostics.some(
    (d) => d.severity === "error" || d.severity === "loss",
  );
  return {
    from,
    to,
    detectedSourceVersion: detected.version,
    recordsExamined,
    recordsChanged,
    applied,
    skippedProvisional,
    diagnostics,
    ok: !blocked,
    output: options.dryRun ? undefined : serializeWithEdits(doc, {
      replacements,
      insertionsAfter,
      removals,
    }),
  };
}

function toRuleInput(
  section: string,
  index: number,
  startLine: number,
  endLine: number,
  lines: string[],
): MctRecordInput {
  const fieldLines = lines.map((l) => splitFields(l));
  return {
    section,
    index,
    startLine,
    endLine,
    lines: [...lines],
    fields: fieldLines[0] ?? [],
    fieldLines,
  };
}

function withLine(
  d: ConversionDiagnostic,
  fallback: number,
): ConversionDiagnostic {
  return d.line === undefined ? { ...d, line: fallback } : d;
}

interface CommentEditSink {
  replacements: Map<number, string[]>;
  insertionsAfter: Map<number, string[]>;
  removals: Set<number>;
  applied: AuditEntry[];
  diagnostics: ConversionDiagnostic[];
}

/**
 * Apply exact-match comment patches scoped to their sections.
 * Replacements resolve first so that insertions anchored on replaced
 * output (e.g. AISC(15th)-ASD16 after the new AISC(14th) line) still match.
 */
function applyCommentPatches(
  doc: MctDocument,
  from: CivilVersion,
  to: CivilVersion,
  sink: CommentEditSink,
): void {
  const patches = commentPatches(from, to);
  // Map section name -> candidate line numbers (comments only).
  const scopeLines = new Map<string, number[]>();
  for (const section of doc.sections) {
    const list = scopeLines.get(section.header.name) ?? [];
    for (let no = section.startLine; no <= section.endLine; no++) {
      if (doc.lines[no - 1]?.text.trimStart().startsWith(";")) list.push(no);
    }
    scopeLines.set(section.header.name, list);
  }
  // Replacement outputs mapped back to original line numbers (for anchors),
  // scoped per section: SECTION and DGN-SECT share identical templates.
  const replacedOutput = new Map<string, number>(); // section|text -> line no

  for (const patch of patches.filter((p) => p.kind === "replace")) {
    const lineNo = findFirst(doc, scopeLines.get(patch.section) ?? [], patch.match);
    if (lineNo === undefined) {
      warnUnmatched(sink, patch);
      continue;
    }
    sink.replacements.set(lineNo, [...patch.payload]);
    replacedOutput.set(`${patch.section}｜${patch.payload[0]}`, lineNo);
    sink.applied.push({
      ruleId: COMMENT_RULE_ID,
      section: patch.section,
      startLine: lineNo,
      endLine: lineNo,
      before: [patch.match],
      after: [...patch.payload],
      severity: "info",
      message: `Comment template refreshed: ${patch.label}.`,
    });
  }

  for (const patch of patches.filter((p) => p.kind === "insert-after")) {
    const anchor =
      findFirst(doc, scopeLines.get(patch.section) ?? [], patch.match) ??
      replacedOutput.get(`${patch.section}｜${patch.match}`);
    if (anchor === undefined) {
      warnUnmatched(sink, patch);
      continue;
    }
    if (followsWith(doc, anchor, patch.payload)) {
      continue; // already applied: keeps comment refresh idempotent
    }
    const existing = sink.insertionsAfter.get(anchor) ?? [];
    sink.insertionsAfter.set(anchor, [...existing, ...patch.payload]);
    sink.applied.push({
      ruleId: COMMENT_RULE_ID,
      section: patch.section,
      startLine: anchor,
      endLine: anchor,
      before: [],
      after: [...patch.payload],
      severity: "info",
      message: `Comment template inserted after line ${anchor}: ${patch.label}.`,
    });
  }

  for (const patch of patches.filter((p) => p.kind === "remove")) {
    const lineNo = findFirst(doc, scopeLines.get(patch.section) ?? [], patch.match);
    if (lineNo === undefined) {
      warnUnmatched(sink, patch);
      continue;
    }
    sink.removals.add(lineNo);
    sink.applied.push({
      ruleId: COMMENT_RULE_ID,
      section: patch.section,
      startLine: lineNo,
      endLine: lineNo,
      before: [patch.match],
      after: [],
      severity: "info",
      message: `Comment template removed: ${patch.label}.`,
    });
  }
}

// Direction pinned per convertDocument call (avoids threading params).
const currentDirection: { from: import("@mct/shared-types").CivilVersion; to: import("@mct/shared-types").CivilVersion } = {
  from: "2022",
  to: "2025",
};

function findFirst(
  doc: MctDocument,
  candidates: number[],
  text: string,
): number | undefined {
  return candidates.find((no) => doc.lines[no - 1]?.text === text);
}

/** True when `payload` already immediately follows the 1-based anchor line. */
function followsWith(
  doc: MctDocument,
  anchor: number,
  payload: string[],
): boolean {
  for (let i = 0; i < payload.length; i++) {
    if (doc.lines[anchor + i]?.text !== payload[i]) return false;
  }
  return true;
}

function warnUnmatched(
  sink: CommentEditSink,
  patch: { section: string; label: string },
): void {
  sink.diagnostics.push({
    code: "MCT-CONV-101",
    ruleId: COMMENT_RULE_ID,
    severity: "warning",
    message: `Comment template not found in ${patch.section}; left untouched: ${patch.label}.`,
    section: patch.section,
  });
}
