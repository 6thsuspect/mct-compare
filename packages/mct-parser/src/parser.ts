import type { Diagnostic } from "@mct/shared-types";
import type {
  MctDocument,
  MctHeader,
  MctLine,
  MctRecord,
  MctSection,
} from "./ast";
import { detectEol, lexLines, parseHeader } from "./lexer";
import { specForSection } from "./sections";

/**
 * Parse MCT text into a lossless document.
 * Never throws on malformed input; problems are reported as diagnostics.
 */
export function parseMct(sourceName: string, text: string): MctDocument {
  const lines = lexLines(text);
  const { eol, eolText } = detectEol(lines);
  const diagnostics: Diagnostic[] = [];

  // Collect headers first.
  const headers: MctHeader[] = [];
  for (const line of lines) {
    if (line.kind === "section-header") {
      const header = parseHeader(line);
      if (header.name === "") {
        diagnostics.push({
          code: "MCT-PARSE-001",
          severity: "error",
          message: `Malformed section header (empty name): ${line.text.trim()}`,
          line: line.no,
        });
      }
      headers.push(header);
    }
  }

  if (headers.length === 0 && lines.some((l) => l.kind === "data")) {
    diagnostics.push({
      code: "MCT-PARSE-002",
      severity: "error",
      message: "No section headers found, but data lines exist.",
    });
  }

  // Orphan data before the first header.
  const firstHeaderLine = headers.length > 0 ? headers[0].line : Infinity;
  for (const line of lines) {
    if (line.no < firstHeaderLine && line.kind === "data") {
      diagnostics.push({
        code: "MCT-PARSE-003",
        severity: "warning",
        message: `Data line before any section header: ${line.text.trim()}`,
        line: line.no,
      });
    }
  }

  // Group data lines into sections.
  const occurrenceByName = new Map<string, number>();
  const sections: MctSection[] = headers.map((header, hi) => {
    const occurrence = occurrenceByName.get(header.name) ?? 0;
    occurrenceByName.set(header.name, occurrence + 1);
    const nextHeaderLine =
      hi + 1 < headers.length ? headers[hi + 1].line : lines.length + 1;
    const body = lines.filter(
      (l) => l.no > header.line && l.no < nextHeaderLine,
    );
    const dataLines = joinContinuations(body.filter((l) => l.kind === "data"));
    const records = groupRecords(
      header.name,
      occurrence,
      dataLines,
      diagnostics,
    );
    return {
      header,
      occurrence,
      startLine: header.line,
      endLine: nextHeaderLine - 1,
      records,
    } satisfies MctSection;
  });

  return { sourceName, eol, eolText, lines, sections, diagnostics };
}

interface JoinedLine {
  /** 1-based first physical line. */
  startLine: number;
  /** 1-based last physical line (inclusive). */
  endLine: number;
  /** Raw physical texts. */
  physical: string[];
  /** Backslash-joined logical text. */
  logical: string;
}

/**
 * Join backslash-continued physical lines (used by GROUP lists).
 * A line ending with `\` (ignoring trailing whitespace) continues on the
 * next physical data line.
 */
function joinContinuations(dataLines: MctLine[]): JoinedLine[] {
  const out: JoinedLine[] = [];
  let i = 0;
  while (i < dataLines.length) {
    const start = dataLines[i];
    const physical: string[] = [start.text];
    let logical = start.text;
    let j = i;
    while (
      logical.trimEnd().endsWith("\\") &&
      j + 1 < dataLines.length &&
      dataLines[j + 1].no === dataLines[j].no + 1
    ) {
      // Strip only the backslash itself; surrounding spacing is preserved
      // in `physical` and normalised by consumers of `logical`.
      logical = logical.trimEnd().slice(0, -1) + "\n" + dataLines[j + 1].text;
      physical.push(dataLines[j + 1].text);
      j += 1;
    }
    out.push({
      startLine: start.no,
      endLine: dataLines[j].no,
      physical,
      logical,
    });
    i = j + 1;
  }
  return out;
}

function groupRecords(
  section: string,
  sectionOccurrence: number,
  dataLines: JoinedLine[],
  diagnostics: Diagnostic[],
): MctRecord[] {
  const spec = specForSection(section);
  const records: MctRecord[] = [];
  const push = (span: JoinedLine[]): void => {
    const physical = span.flatMap((s) => s.physical);
    records.push({
      section,
      sectionOccurrence,
      index: records.length,
      startLine: span[0].startLine,
      endLine: span[span.length - 1].endLine,
      lines: physical,
      logicalLines: span.map((s) => s.logical),
    });
  };

  if (spec.record.kind === "single") {
    for (const jl of dataLines) push([jl]);
    return records;
  }

  if (spec.record.kind === "pairs") {
    let i = 0;
    while (i < dataLines.length) {
      const next = dataLines[i + 1];
      if (
        next &&
        !(spec.record.nextStartsRecord && spec.record.nextStartsRecord.test(next.logical))
      ) {
        push([dataLines[i], next]);
        i += 2;
      } else {
        if (!next) {
          diagnostics.push({
            code: "MCT-PARSE-010",
            severity: "warning",
            message: `Unpaired trailing record line in section ${section}.`,
            section,
            line: dataLines[i].startLine,
          });
        }
        push([dataLines[i]]);
        i += 1;
      }
    }
    return records;
  }

  // start-pattern
  let current: JoinedLine[] | null = null;
  for (const jl of dataLines) {
    if (spec.record.start.test(jl.logical)) {
      if (current) push(current);
      current = [jl];
    } else if (current) {
      current.push(jl);
    } else {
      diagnostics.push({
        code: "MCT-PARSE-011",
        severity: "warning",
        message: `Orphan follower line before the first record in section ${section}; kept as its own record.`,
        section,
        line: jl.startLine,
      });
      push([jl]);
    }
  }
  if (current) push(current);
  return records;
}

/** All section occurrences with the given normalised name. */
export function getSections(doc: MctDocument, name: string): MctSection[] {
  const upper = name.toUpperCase();
  return doc.sections.filter((s) => s.header.name === upper);
}

/** Total number of records in the document. */
export function countRecords(doc: MctDocument): number {
  return doc.sections.reduce((n, s) => n + s.records.length, 0);
}
