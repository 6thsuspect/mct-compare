/**
 * Section-aware record grouping rules.
 *
 * Most MCT sections hold one record per physical data line, but several
 * sections use multi-line records. Grouping must be explicit per section:
 * guessing continuations generically would corrupt record identity (and
 * therefore semantic diffing and conversion).
 */

export type RecordGrouping =
  | { kind: "single" }
  | {
      kind: "pairs";
      /** Guard: when the next line starts a new record, do not pair. */
      nextStartsRecord?: RegExp;
    }
  | {
      kind: "start-pattern";
      /** A record starts here; following data lines belong to it until the next start. */
      start: RegExp;
    };

export interface SectionSpec {
  name: string;
  record: RecordGrouping;
  /** Short note for documentation / diagnostics. */
  note: string;
}

/** TYPE keywords that can start a SECTION-family record header line. */
const SECTION_TYPES =
  "DBUSER|TAPERED|VALUE|SRC|COMBINED|CONSTRUCT|COMPOSITE(?:-[A-Z]+)?|PSC";

const SPECS: Record<string, SectionSpec> = {
  SECTION: {
    name: "SECTION",
    record: {
      kind: "start-pattern",
      start: new RegExp(`^\\s*\\d+\\s*,\\s*(?:${SECTION_TYPES})\\b`, "i"),
    },
    note: "TAPERED/VALUE/SRC/... records span a header line plus follower lines; followers are consumed until the next record start.",
  },
  "DGN-SECT": {
    name: "DGN-SECT",
    record: {
      kind: "start-pattern",
      start: new RegExp(`^\\s*\\d+\\s*,\\s*(?:${SECTION_TYPES})\\b`, "i"),
    },
    note: "Mirrors SECTION grouping (design sections).",
  },
  LOADCOMB: {
    name: "LOADCOMB",
    record: { kind: "start-pattern", start: /^\s*NAME\s*=/i },
    note: "One NAME= header line plus its factor lines.",
  },
  "FRAME-RLS": {
    name: "FRAME-RLS",
    record: {
      kind: "pairs",
      nextStartsRecord: /^\s*\d+\s*,\s*(YES|NO)\s*,/i,
    },
    note: "Two physical lines per record (i-end / j-end).",
  },
  "SECTION MANAGER-GROUP & PART": {
    name: "SECTION MANAGER-GROUP & PART",
    record: { kind: "start-pattern", start: /SECT\s*=/i },
    note: "SECT= header plus follower lines.",
  },
  "SECTION MANAGER-STIFFENER": {
    name: "SECTION MANAGER-STIFFENER",
    record: { kind: "start-pattern", start: /SECT\s*=/i },
    note: "SECT= header plus follower lines.",
  },
};

const DEFAULT_SPEC: SectionSpec = {
  name: "*",
  record: { kind: "single" },
  note: "One record per physical data line (backslash continuations joined).",
};

export function specForSection(name: string): SectionSpec {
  return SPECS[name] ?? { ...DEFAULT_SPEC, name };
}

export function knownSectionNames(): string[] {
  return Object.keys(SPECS);
}
