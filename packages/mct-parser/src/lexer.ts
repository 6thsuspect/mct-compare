import type { MctEol } from "@mct/shared-types";
import type { LineKind, MctHeader, MctLine } from "./ast";

/** Split text into physical lines, remembering each line's terminator. */
export function lexLines(text: string): MctLine[] {
  const lines: MctLine[] = [];
  // Keep terminators so the serializer can reproduce bytes exactly.
  const parts = text.split(/(\r\n|\n)/);
  let no = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const content = parts[i] ?? "";
    const ending = parts[i + 1] ?? "";
    // split() yields a trailing "" when text ends with a terminator;
    // that is not a real line.
    if (content === "" && ending === "" && i + 2 >= parts.length && no > 0) {
      break;
    }
    // Edge: completely empty file -> no lines at all.
    if (content === "" && ending === "" && parts.length === 1) {
      break;
    }
    no += 1;
    lines.push({ no, text: content, ending, kind: classify(content) });
  }
  return lines;
}

export function classify(text: string): LineKind {
  const trimmed = text.trim();
  if (trimmed === "") return "blank";
  if (trimmed.startsWith(";")) return "comment";
  if (trimmed.startsWith("*")) return "section-header";
  return "data";
}

export function detectEol(lines: MctLine[]): {
  eol: MctEol;
  eolText: "\n" | "\r\n";
} {
  let crlf = 0;
  let lf = 0;
  for (const l of lines) {
    if (l.ending === "\r\n") crlf += 1;
    else if (l.ending === "\n") lf += 1;
  }
  if (crlf === 0 && lf === 0) return { eol: "none", eolText: "\n" };
  if (crlf > 0 && lf === 0) return { eol: "crlf", eolText: "\r\n" };
  if (lf > 0 && crlf === 0) return { eol: "lf", eolText: "\n" };
  return { eol: "mixed", eolText: crlf >= lf ? "\r\n" : "\n" };
}

/**
 * Parse a `*HEADER` line.
 *
 * Identity rule: strip the leading `*`, cut at the first `;` (comment),
 * then split at the first `,` — the part before it is the section name
 * (upper-cased, whitespace collapsed), the rest are header arguments.
 * This keeps `*SECTION` distinct from `*SECTION MANAGER-GROUP & PART`
 * while treating `*USE-STLD, Girder Weight` as section USE-STLD.
 */
export function parseHeader(line: MctLine): MctHeader {
  const raw = line.text;
  const withoutStar = raw.replace(/^\s*\*/, "");
  const semi = withoutStar.indexOf(";");
  const head = (semi >= 0 ? withoutStar.slice(0, semi) : withoutStar).trim();
  const comment =
    semi >= 0 ? withoutStar.slice(semi + 1).trim() || undefined : undefined;
  const comma = head.indexOf(",");
  const namePart = (comma >= 0 ? head.slice(0, comma) : head).trim();
  const args =
    comma >= 0
      ? head
          .slice(comma + 1)
          .split(",")
          .map((a) => a.trim())
          .filter((a) => a !== "")
      : [];
  const name = namePart.toUpperCase().replace(/\s+/g, " ");
  return { line: line.no, raw, name, comment, args };
}

/**
 * Split a data line into top-level comma fields.
 * MCT fields are unquoted in practice (names never contain commas),
 * so a plain split is both correct and lossless when combined with trim.
 */
export function splitFields(line: string): string[] {
  return line.split(",").map((f) => f.trim());
}
