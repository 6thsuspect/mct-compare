import type { MctDocument } from "./ast";

/** Reproduce the original source bytes exactly. */
export function serializeMct(doc: MctDocument): string {
  return doc.lines.map((l) => l.text + l.ending).join("");
}

export interface LineEdits {
  /**
   * 1-based start line -> replacement physical lines (without terminators).
   * When the start line opens a record, the whole record span is replaced;
   * otherwise exactly one line is replaced.
   */
  replacements?: Map<number, string[]>;
  /** Insert lines immediately after the given 1-based original line. */
  insertionsAfter?: Map<number, string[]>;
  /** 1-based original lines to drop. */
  removals?: Set<number>;
}

/**
 * Serialize with line edits (record replacements, insertions, removals).
 * Untouched lines keep their original terminators, so output stays
 * byte-stable outside the edited spans.
 */
export function serializeWithEdits(
  doc: MctDocument,
  edits: LineEdits,
): string {
  const replacements = edits.replacements ?? new Map<number, string[]>();
  const insertionsAfter = edits.insertionsAfter ?? new Map<number, string[]>();
  const removals = edits.removals ?? new Set<number>();

  const spanByStart = new Map<number, number>();
  for (const section of doc.sections) {
    for (const record of section.records) {
      spanByStart.set(record.startLine, record.endLine);
    }
  }

  const out: string[] = [];
  let no = 1;
  while (no <= doc.lines.length) {
    if (removals.has(no) && !replacements.has(no)) {
      no += 1;
      continue;
    }
    const replacement = replacements.get(no);
    if (replacement !== undefined) {
      const endLine = spanByStart.get(no) ?? no;
      const originalEndings = doc.lines
        .slice(no - 1, endLine)
        .map((l) => l.ending);
      const fallbackEnding =
        originalEndings[0] ?? (endLine >= doc.lines.length ? "" : doc.eolText);
      replacement.forEach((text, i) => {
        const ending =
          i < originalEndings.length ? originalEndings[i] : fallbackEnding;
        out.push(text + ending);
      });
      emitInsertions(insertionsAfter.get(endLine), endLine);
      no = endLine + 1;
    } else {
      const line = doc.lines[no - 1];
      out.push(line.text + line.ending);
      emitInsertions(insertionsAfter.get(no), no);
      no += 1;
    }
  }

  function emitInsertions(inserted: string[] | undefined, anchor: number): void {
    if (!inserted || inserted.length === 0) return;
    const anchorEnding = doc.lines[anchor - 1]?.ending ?? doc.eolText;
    if (anchorEnding === "") {
      // Anchor is the unterminated last line: terminate it, then the
      // inserted block carries the EOF state.
      out[out.length - 1] += doc.eolText;
      inserted.forEach((text, i) => {
        out.push(text + (i === inserted.length - 1 ? "" : doc.eolText));
      });
    } else {
      for (const text of inserted) out.push(text + anchorEnding);
    }
  }

  return out.join("");
}

/**
 * Serialize with record replacements.
 *
 * @param replacements maps a record's 1-based `startLine` to replacement
 *        physical lines (without terminators). Span: the record's
 *        [startLine, endLine] is replaced wholesale.
 */
export function serializeWithReplacements(
  doc: MctDocument,
  replacements: Map<number, string[]>,
): string {
  // Index records by start line for span lookup.
  const spanByStart = new Map<number, number>();
  for (const section of doc.sections) {
    for (const record of section.records) {
      spanByStart.set(record.startLine, record.endLine);
    }
  }

  const out: string[] = [];
  let no = 1;
  while (no <= doc.lines.length) {
    const replacement = replacements.get(no);
    if (replacement !== undefined) {
      const endLine = spanByStart.get(no) ?? no;
      const originalEndings = doc.lines
        .slice(no - 1, endLine)
        .map((l) => l.ending);
      const fallbackEnding =
        originalEndings[0] ?? (endLine >= doc.lines.length ? "" : doc.eolText);
      replacement.forEach((text, i) => {
        const ending =
          i < originalEndings.length ? originalEndings[i] : fallbackEnding;
        out.push(text + ending);
      });
      // If the replacement is shorter than the original span, the remaining
      // original lines are dropped; if longer, extra lines reuse the
      // record's first terminator. The no===doc.lines.length edge (a
      // record ending at EOF without terminator) is preserved via endings.
      no = endLine + 1;
    } else {
      const line = doc.lines[no - 1];
      out.push(line.text + line.ending);
      no += 1;
    }
  }
  return out.join("");
}
