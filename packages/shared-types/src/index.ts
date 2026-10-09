/**
 * @mct/shared-types — kernel types shared by the parser, diff, converter and
 * validation packages. This package must stay dependency-free.
 */

/** Supported MIDAS CIVIL generations. */
export type CivilVersion = "2022" | "2025";

/** A detected version, or "unknown" when it cannot be established. */
export type DetectedVersion = CivilVersion | "unknown";

/** Line-ending style observed in a source file. */
export type MctEol = "lf" | "crlf" | "mixed" | "none";

/** Severity ladder used by diagnostics, validation and conversion. */
export type Severity = "info" | "warning" | "error" | "loss";

/**
 * Confidence of a conversion rule.
 * - verified:    backed by reference-file evidence AND schema documentation
 *                (comment templates) or vendor documentation.
 * - provisional: backed by reference-file evidence only; the exact meaning of
 *                the transformed field is not documented. Requires review.
 */
export type ConversionConfidence = "verified" | "provisional";

/** A single machine-readable diagnostic. */
export interface Diagnostic {
  /** Stable machine-readable code, e.g. "MCT-ELEM-001". */
  code: string;
  severity: Severity;
  /** Human-readable message. */
  message: string;
  /** Section name (normalised) if applicable. */
  section?: string;
  /** 1-based line number in the relevant file. */
  line?: number;
  /** Optional record key within the section. */
  recordKey?: string;
  /** Optional hint for remediation. */
  hint?: string;
}

/** A record inside an MCT document (parser-level view). */
export interface MctRecordRef {
  /** Normalised section name, e.g. "NODE", "SECTION", "BEAMLOAD". */
  section: string;
  /** 0-based record index within its section occurrence. */
  index: number;
  /** 1-based first line number. */
  startLine: number;
  /** 1-based last line number (inclusive). */
  endLine: number;
}

/**
 * Conversion rule contract (see docs/conversion-rules.md).
 * Rules operate on parsed records and must never silently drop content.
 */
export interface ConversionRule {
  /** Stable identifier, e.g. "MCT-CVT-002". */
  id: string;
  from: CivilVersion;
  to: CivilVersion;
  /** Section scope, e.g. "SECTION". */
  command: string;
  description: string;
  confidence: ConversionConfidence;
  /**
   * True when the rule must only run after explicit user acknowledgement
   * (provisional or potentially lossy mappings).
   */
  requiresReview: boolean;
  /**
   * True when this rule only touches comments/formatting and never changes
   * engineering data.
   */
  cosmetic?: boolean;
  apply: (record: MctRecordInput) => RuleResult;
}

/** Minimal record view handed to conversion rules. */
export interface MctRecordInput extends MctRecordRef {
  /** Raw physical lines of the record (without EOL). */
  lines: string[];
  /** Top-level comma fields of the first line (trimmed). */
  fields: string[];
  /** All physical lines split into trimmed comma fields. */
  fieldLines: string[][];
}

export interface RuleResult {
  /** Replacement physical lines (without EOL). Must be lossless. */
  lines: string[];
  diagnostics: ConversionDiagnostic[];
  changed: boolean;
}

export interface ConversionDiagnostic extends Diagnostic {
  ruleId: string;
}

export interface ConversionOptions {
  from: CivilVersion;
  to: CivilVersion;
  /** Apply provisional rules (default false). */
  includeProvisional?: boolean;
  /** Apply cosmetic comment-template refresh rules (default false). */
  refreshComments?: boolean;
  /** Dry run: compute the audit without producing output text. */
  dryRun?: boolean;
}

/** One entry of the conversion audit trail. */
export interface AuditEntry {
  ruleId: string;
  section: string;
  startLine: number;
  endLine: number;
  recordKey?: string;
  before: string[];
  after: string[];
  severity: Severity;
  message: string;
  /**
   * Set on grouped entries (e.g. skipped provisional rules) where one entry
   * summarises many records; absent (single record) otherwise.
   */
  count?: number;
}

export interface ConversionReport {
  from: CivilVersion;
  to: CivilVersion;
  detectedSourceVersion: DetectedVersion;
  /** Number of records examined. */
  recordsExamined: number;
  /** Number of records changed. */
  recordsChanged: number;
  applied: AuditEntry[];
  /** Rules skipped because they need review, per record-group. */
  skippedProvisional: AuditEntry[];
  diagnostics: ConversionDiagnostic[];
  /** True when output was produced. */
  ok: boolean;
  /** Output text (absent for dry runs). */
  output?: string;
}

/** Semantic comparison status of one matched record. */
export type SemanticStatus =
  | "equivalent"
  | "modified"
  | "added"
  | "removed"
  | "unclassified";

/** Engineering category of a semantic record. */
export type SemanticCategory =
  | "geometry"
  | "sections"
  | "materials"
  | "supports"
  | "loads"
  | "combinations"
  | "analysis"
  | "stages"
  | "settings"
  | "groups"
  | "other";

export interface FieldDifference {
  field: string;
  before: string;
  after: string;
}

export interface SemanticChange {
  category: SemanticCategory;
  section: string;
  /** Stable match key within the section. */
  key: string;
  /** Short human label, e.g. "NODE 2648". */
  label: string;
  status: SemanticStatus;
  fields?: FieldDifference[];
  /** 1-based line numbers in file A (reference/original). */
  aLines?: number[];
  /** 1-based line numbers in file B (modified/target). */
  bLines?: number[];
  note?: string;
}

export interface SemanticDiffSummary {
  equivalent: number;
  modified: number;
  added: number;
  removed: number;
  unclassified: number;
}

export type TextDiffOp = "equal" | "replace" | "insert" | "delete";

export interface TextHunk {
  op: Exclude<TextDiffOp, "equal">;
  /** 0-based, end-exclusive span in file A. */
  aStart: number;
  aEnd: number;
  /** 0-based, end-exclusive span in file B. */
  bStart: number;
  bEnd: number;
  aLines: string[];
  bLines: string[];
  /** Nearest enclosing section in A / B (if known). */
  aSection?: string;
  bSection?: string;
}

export interface TextDiffResult {
  hunks: TextHunk[];
  added: number;
  deleted: number;
  /** Lines in replace-hunks on the A side. */
  modifiedBefore: number;
  /** Lines in replace-hunks on the B side. */
  modifiedAfter: number;
  /** aLine (0-based) -> bLine (0-based) for equal lines. */
  lineMap: Array<[number, number]>;
}

export interface ValidationReport {
  file: string;
  detectedVersion: DetectedVersion;
  targetVersion?: CivilVersion;
  /** Level 1: file readable, parses, serializes. */
  fileOk: boolean;
  stats: {
    lines: number;
    sections: number;
    records: number;
    bytes: number;
  };
  diagnostics: Diagnostic[];
  /** Counts by severity. */
  counts: Record<Severity, number>;
}
