import type { Diagnostic, MctEol } from "@mct/shared-types";

/** Classification of one physical source line. */
export type LineKind = "section-header" | "comment" | "blank" | "data";

/** One physical line of the source file (without its terminator). */
export interface MctLine {
  /** 1-based line number. */
  no: number;
  /** Raw text without the line terminator. */
  text: string;
  /** Original terminator: "\r\n", "\n" or "" (only legal on the last line). */
  ending: string;
  kind: LineKind;
}

/** A parsed `*SECTION` header line. */
export interface MctHeader {
  /** 1-based line number of the header. */
  line: number;
  /** Raw header text (without terminator). */
  raw: string;
  /**
   * Normalised identity: upper-cased, inner whitespace collapsed.
   * Examples: "NODE", "USE-STLD", "SECTION MANAGER-GROUP & PART".
   */
  name: string;
  /** Trailing `; comment` of the header (without ";"), if present. */
  comment?: string;
  /** Comma-separated header arguments, e.g. ["Girder Weight"] for USE-STLD. */
  args: string[];
}

/**
 * One logical record: one or more consecutive physical data lines that
 * belong together (e.g. a TAPERED section spans a header + dimension line,
 * a GROUP record may span many backslash-continued lines).
 */
export interface MctRecord {
  /** Normalised section name. */
  section: string;
  /** 0-based occurrence of the section name within the document. */
  sectionOccurrence: number;
  /** 0-based record index within its section occurrence. */
  index: number;
  /** 1-based first physical line. */
  startLine: number;
  /** 1-based last physical line (inclusive). */
  endLine: number;
  /** Raw physical line texts (copies, without terminators). */
  lines: string[];
  /**
   * Physical lines joined through backslash continuations. For records
   * without continuations this equals `lines`.
   */
  logicalLines: string[];
}

export interface MctSection {
  header: MctHeader;
  /** 0-based occurrence among sections sharing the same name. */
  occurrence: number;
  /** 1-based first line (the header line). */
  startLine: number;
  /** 1-based last line belonging to the section (inclusive). */
  endLine: number;
  records: MctRecord[];
}

/**
 * Lossless document: every source byte is retained either in `lines`
 * (with per-line terminators) or derivable from them, so
 * `serialize(parse(text)) === text` always holds.
 */
export interface MctDocument {
  /** Logical file name, used only for diagnostics. */
  sourceName: string;
  eol: MctEol;
  /** Dominant terminator ("\n" unless the file is pure CRLF). */
  eolText: "\n" | "\r\n";
  lines: MctLine[];
  sections: MctSection[];
  diagnostics: Diagnostic[];
}
