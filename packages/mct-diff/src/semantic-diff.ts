import type {
  FieldDifference,
  SemanticChange,
  SemanticDiffSummary,
} from "@mct/shared-types";
import type { SemanticModel, SemanticRecord } from "./model";

export interface SemanticDiffOptions {
  /** Include `equivalent` records in `changes` (default false). */
  includeEquivalent?: boolean;
}

export interface SemanticDiffResult {
  changes: SemanticChange[];
  summary: SemanticDiffSummary;
}

/**
 * Engineering-aware comparison: records are matched by (section, key) —
 * never by line position — and compared field by field on normalised
 * values. Formatting-only edits therefore yield no engineering change,
 * while unrecognised sections are reported as `unclassified`, never as
 * equivalent.
 */
export function diffModels(
  a: SemanticModel,
  b: SemanticModel,
  options: SemanticDiffOptions = {},
): SemanticDiffResult {
  const indexB = new Map<string, SemanticRecord>();
  for (const r of b.records) indexB.set(matchKey(r.section, r.key), r);

  const changes: SemanticChange[] = [];
  const summary: SemanticDiffSummary = {
    equivalent: 0,
    modified: 0,
    added: 0,
    removed: 0,
    unclassified: 0,
  };
  const matchedB = new Set<string>();

  for (const ra of a.records) {
    const k = matchKey(ra.section, ra.key);
    const rb = indexB.get(k);
    if (!rb) {
      summary.removed += 1;
      changes.push({
        category: ra.category,
        section: ra.section,
        key: ra.key,
        label: ra.label,
        status: "removed",
        aLines: lineRange(ra.startLine, ra.endLine),
      });
      continue;
    }
    matchedB.add(k);
    if (!ra.understood || !rb.understood) {
      summary.unclassified += 1;
      const fields = compareFields(ra, rb);
      changes.push({
        category: ra.category,
        section: ra.section,
        key: ra.key,
        label: ra.label,
        status: "unclassified",
        fields: fields.length > 0 ? fields : undefined,
        aLines: lineRange(ra.startLine, ra.endLine),
        bLines: lineRange(rb.startLine, rb.endLine),
        note:
          fields.length === 0
            ? "Identical raw content, but the section meaning is not recognised — engineering equivalence is unverified."
            : "Section meaning is not recognised; raw field differences shown.",
      });
      continue;
    }
    const fields = compareFields(ra, rb);
    if (fields.length === 0) {
      summary.equivalent += 1;
      if (options.includeEquivalent) {
        changes.push({
          category: ra.category,
          section: ra.section,
          key: ra.key,
          label: ra.label,
          status: "equivalent",
          aLines: lineRange(ra.startLine, ra.endLine),
          bLines: lineRange(rb.startLine, rb.endLine),
        });
      }
    } else {
      summary.modified += 1;
      changes.push({
        category: ra.category,
        section: ra.section,
        key: ra.key,
        label: ra.label,
        status: "modified",
        fields,
        aLines: lineRange(ra.startLine, ra.endLine),
        bLines: lineRange(rb.startLine, rb.endLine),
      });
    }
  }

  for (const rb of b.records) {
    const k = matchKey(rb.section, rb.key);
    if (matchedB.has(k)) continue;
    summary.added += 1;
    changes.push({
      category: rb.category,
      section: rb.section,
      key: rb.key,
      label: rb.label,
      status: "added",
      bLines: lineRange(rb.startLine, rb.endLine),
    });
  }

  return { changes, summary };
}

function matchKey(section: string, key: string): string {
  return `${section}｜${key}`;
}

function lineRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = from; n <= to; n++) out.push(n);
  return out;
}

/**
 * Positional field comparison. Field *names* come from the section layout;
 * a layout shift (e.g. an inserted column) surfaces as a run of changed
 * fields starting at the insertion point — exactly what a reviewer needs
 * to see for version migrations.
 */
function compareFields(a: SemanticRecord, b: SemanticRecord): FieldDifference[] {
  const diffs: FieldDifference[] = [];
  const n = Math.max(a.fields.length, b.fields.length);
  for (let i = 0; i < n; i++) {
    const fa = a.fields[i];
    const fb = b.fields[i];
    if (!fa && fb) {
      diffs.push({ field: fb.name, before: "", after: fb.value });
    } else if (fa && !fb) {
      diffs.push({ field: fa.name, before: fa.value, after: "" });
    } else if (fa && fb && (fa.name !== fb.name || fa.value !== fb.value)) {
      diffs.push({
        field: fa.name === fb.name ? fa.name : `${fa.name}→${fb.name}`,
        before: fa.value,
        after: fb.value,
      });
    }
  }
  return diffs;
}
