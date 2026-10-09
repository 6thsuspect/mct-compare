import type { MctDocument, MctRecord } from "@mct/parser";
import type { SemanticCategory } from "@mct/shared-types";
import {
  KeyScope,
  keyValue,
  namedFields,
  normalizeValue,
  recordFieldLines,
} from "./matchers";

export interface SemanticField {
  name: string;
  value: string;
}

export interface SemanticRecord {
  category: SemanticCategory;
  section: string;
  /** Stable match key, unique within (section, occurrence-suffix handling). */
  key: string;
  label: string;
  fields: SemanticField[];
  /**
   * False when the section is not recognised: the record is carried with
   * raw positional fields and always reported as `unclassified`.
   */
  understood: boolean;
  startLine: number;
  endLine: number;
}

export interface SemanticModel {
  records: SemanticRecord[];
}

interface Extractor {
  category: SemanticCategory;
  extract: (
    record: MctRecord,
    fields: string[][],
    scope: KeyScope,
  ) => { key: string; label: string; fields: SemanticField[] };
}

const toFields = (pairs: Array<[string, string]>): SemanticField[] =>
  pairs.map(([name, value]) => ({ name, value }));

const firstFieldKey = (
  section: string,
  aliases: string[] = [],
): Extractor["extract"] => {
  return (record, fields) => {
    const head = fields[0] ?? [];
    const id = head[0] !== "" ? head[0] : `#${record.index}`;
    return {
      key: id,
      label: `${section} ${id}`,
      fields: toFields(
        fields.flatMap((line, li) =>
          namedFields(line, li === 0 ? aliases : [], li === 0 ? "" : `L${li + 1}:`),
        ),
      ),
    };
  };
};

const positionalKey = (section: string): Extractor["extract"] => {
  return (record, fields) => ({
    key: `#${record.index}`,
    label: `${section} #${record.index + 1}`,
    fields: toFields(
      fields.flatMap((line, li) =>
        namedFields(line, [], li === 0 ? "" : `L${li + 1}:`),
      ),
    ),
  });
};

const EXTRACTORS: Record<string, Extractor> = {
  NODE: {
    category: "geometry",
    extract: firstFieldKey("NODE", ["id", "x", "y", "z"]),
  },
  ELEMENT: {
    category: "geometry",
    extract: firstFieldKey("ELEMENT", [
      "id",
      "type",
      "mat",
      "sec",
      "n1",
      "n2",
      "n3",
      "n4",
    ]),
  },
  SECTION: {
    category: "sections",
    extract: (record, fields, scope) => {
      const head = fields[0] ?? [];
      const base = firstFieldKey("SECTION", ["id", "type", "name"])(record, fields, scope);
      return {
        ...base,
        label: `SECTION ${head[0] ?? "?"} ${head[1] ?? ""} ${(head[2] ?? "").trim()}`.trim(),
      };
    },
  },
  "DGN-SECT": {
    category: "sections",
    extract: (record, fields, scope) => {
      const head = fields[0] ?? [];
      const base = firstFieldKey("DGN-SECT", ["id", "type", "name"])(record, fields, scope);
      return {
        ...base,
        label: `DGN-SECT ${head[0] ?? "?"} ${head[1] ?? ""} ${(head[2] ?? "").trim()}`.trim(),
      };
    },
  },
  "COMP-GEN-SECT-PSC-DESIGN": {
    category: "sections",
    extract: firstFieldKey("COMP-GEN-SECT-PSC-DESIGN", ["id"]),
  },
  "SECTION MANAGER-GROUP & PART": {
    category: "sections",
    extract: positionalKey("SECTION MANAGER-GROUP & PART"),
  },
  "SECTION MANAGER-STIFFENER": {
    category: "sections",
    extract: positionalKey("SECTION MANAGER-STIFFENER"),
  },
  MATERIAL: {
    category: "materials",
    extract: firstFieldKey("MATERIAL", ["id", "type", "name"]),
  },
  "DGN-MATL": {
    category: "materials",
    extract: firstFieldKey("DGN-MATL", ["id", "type", "name"]),
  },
  "REBAR-MATL-CODE": {
    category: "materials",
    extract: positionalKey("REBAR-MATL-CODE"),
  },
  CONSTRAINT: {
    category: "supports",
    extract: (record, fields) => ({
      key: `#${record.index}`,
      label: `CONSTRAINT #${record.index + 1}`,
      fields: toFields(namedFields(fields[0] ?? [], ["nodes", "restraint", "group"])),
    }),
  },
  SPRING: {
    category: "supports",
    extract: positionalKey("SPRING"),
  },
  ELASTICLINK: {
    category: "supports",
    extract: firstFieldKey("ELASTICLINK", ["id", "n1", "n2", "type"]),
  },
  "FRAME-RLS": {
    category: "supports",
    extract: (record, fields, scope) => {
      const elem = fields[0]?.[0] ?? `?${record.index}`;
      const n = scope.next("FRAME-RLS", elem);
      return {
        key: KeyScope.suffixed(elem, n),
        label: `FRAME-RLS ${elem}`,
        fields: toFields(
          fields.flatMap((line, li) =>
            namedFields(
              line,
              li === 0 ? ["elem", "bValue"] : [],
              li === 0 ? "" : "L2:",
            ),
          ),
        ),
      };
    },
  },
  STLDCASE: {
    category: "loads",
    extract: (record, fields) => {
      const name = fields[0]?.[0] ?? `#${record.index}`;
      return {
        key: name,
        label: `STLDCASE ${name}`,
        fields: toFields(namedFields(fields[0] ?? [], ["name", "type", "desc"])),
      };
    },
  },
  "USE-STLD": {
    category: "loads",
    extract: (record, fields) => ({
      key: `#${record.index}`,
      label: `USE-STLD ${(fields[0]?.[0] ?? "").trim()}`,
      fields: toFields(namedFields(fields[0] ?? [], ["case"])),
    }),
  },
  BEAMLOAD: {
    category: "loads",
    extract: (record, fields, scope) => {
      const elem = fields[0]?.[0] ?? `?${record.index}`;
      const n = scope.next("BEAMLOAD", elem);
      return {
        key: `${elem}#${n}`,
        label: n === 0 ? `BEAMLOAD ${elem}` : `BEAMLOAD ${elem} (${n + 1})`,
        fields: toFields(
          namedFields(fields[0] ?? [], [
            "elem",
            "cmd",
            "loadtype",
            "dir",
            "bProj",
            "bEccen",
            "eccdir",
            "eccI",
            "eccJ",
            "eccJb",
          ]),
        ),
      };
    },
  },
  LOADTOMASS: {
    category: "loads",
    extract: positionalKey("LOADTOMASS"),
  },
  SELFWEIGHT: {
    category: "loads",
    extract: positionalKey("SELFWEIGHT"),
  },
  LOADCOMB: {
    category: "combinations",
    extract: (record, fields) => {
      const head = fields[0] ?? [];
      const kv = head[0] ? keyValue(head[0]) : null;
      const name = kv && kv.key === "NAME" ? kv.value : `#${record.index}`;
      const out: Array<[string, string]> = [];
      head.forEach((value, i) => {
        if (i === 0) {
          out.push(["name", normalizeValue(name)]);
          return;
        }
        const alias = [
          "kind",
          "active",
          "bEs",
          "iType",
          "desc",
          "iServType",
          "lcomType",
          "seisType",
          "lcomFactor",
        ][i - 1];
        out.push([alias ?? `c${i + 1}`, value]);
      });
      fields.slice(1).forEach((line, li) => {
        line.forEach((value, i) => out.push([`L${li + 2}:c${i + 1}`, value]));
      });
      return { key: name, label: `LOADCOMB ${name}`, fields: toFields(out) };
    },
  },
  "DGN-STEEL": {
    category: "analysis",
    extract: positionalKey("DGN-STEEL"),
  },
  LENGTH: {
    category: "analysis",
    extract: positionalKey("LENGTH"),
  },
  LIMITSRATIO: {
    category: "analysis",
    extract: positionalKey("LIMITSRATIO"),
  },
  VERSION: {
    category: "settings",
    extract: (_record, fields) => ({
      key: "VERSION",
      label: "VERSION",
      fields: toFields(namedFields(fields[0] ?? [], ["version"])),
    }),
  },
  UNIT: {
    category: "settings",
    extract: (_record, fields) => ({
      key: "UNIT",
      label: "UNIT",
      fields: toFields(
        namedFields(fields[0] ?? [], ["force", "length", "heat", "temper"]),
      ),
    }),
  },
  PROJINFO: {
    category: "settings",
    extract: positionalKey("PROJINFO"),
  },
  STRUCTYPE: {
    category: "settings",
    extract: positionalKey("STRUCTYPE"),
  },
  GROUP: {
    category: "groups",
    extract: (record, fields) => {
      const name = fields[0]?.[0] ?? `#${record.index}`;
      return {
        key: name,
        label: `GROUP ${name}`,
        fields: toFields(
          namedFields(fields[0] ?? [], ["name", "nodes", "elems", "plane"]),
        ),
      };
    },
  },
  "BNDR-GROUP": {
    category: "groups",
    extract: (record, fields) => {
      const name = fields[0]?.[0] ?? `#${record.index}`;
      return {
        key: name,
        label: `BNDR-GROUP ${name}`,
        fields: toFields(namedFields(fields[0] ?? [], ["name"])),
      };
    },
  },
  "LOAD-GROUP": {
    category: "groups",
    extract: (record, fields) => {
      const name = fields[0]?.[0] ?? `#${record.index}`;
      return {
        key: name,
        label: `LOAD-GROUP ${name}`,
        fields: toFields(namedFields(fields[0] ?? [], ["name"])),
      };
    },
  },
  "SECT-COLOR": {
    category: "other",
    extract: firstFieldKey("SECT-COLOR", ["id"]),
  },
  "MATL-COLOR": {
    category: "other",
    extract: firstFieldKey("MATL-COLOR", ["id"]),
  },
  "LC-COLOR": {
    category: "other",
    extract: (record, fields) => {
      const head = fields[0] ?? [];
      const key = `${head[0] ?? ""}:${head[1] ?? `#${record.index}`}`;
      return {
        key,
        label: `LC-COLOR ${head[1] ?? "?"}`,
        fields: toFields(namedFields(head, ["anal", "name"])),
      };
    },
  },
};

/** Sections intentionally excluded from the semantic model. */
const SKIPPED_SECTIONS = new Set(["ENDDATA"]);

function fallbackExtract(
  section: string,
  record: MctRecord,
  fields: string[][],
): { key: string; label: string; fields: SemanticField[] } {
  return {
    key: `#${record.index}`,
    label: `${section} #${record.index + 1}`,
    fields: toFields(
      fields.flatMap((line, li) =>
        namedFields(line, [], li === 0 ? "" : `L${li + 1}:`),
      ),
    ),
  };
}

/** Build the engineering-aware semantic model of a document. */
export function buildModel(doc: MctDocument): SemanticModel {
  const scope = new KeyScope();
  const usedKeys = new Set<string>();
  const records: SemanticRecord[] = [];

  for (const section of doc.sections) {
    const name = section.header.name;
    if (SKIPPED_SECTIONS.has(name)) continue;
    const extractor = EXTRACTORS[name];

    if (section.records.length === 0) {
      // Header-only section (e.g. USE-STLD scoping a load case): model the
      // header itself so scoping changes are still detected.
      if (section.header.args.length > 0 && extractor) {
        const fields = [section.header.args.map(normalizeValue)];
        const { key, label, fields: out } = extractor.extract(
          {
            section: name,
            sectionOccurrence: section.occurrence,
            index: section.occurrence,
            startLine: section.startLine,
            endLine: section.startLine,
            lines: [section.header.raw],
            logicalLines: [section.header.raw],
          },
          fields,
          scope,
        );
        records.push({
          category: extractor.category,
          section: name,
          key: dedupe(usedKeys, name, key),
          label,
          fields: out,
          understood: true,
          startLine: section.startLine,
          endLine: section.startLine,
        });
      }
      continue;
    }

    for (const record of section.records) {
      const fields = recordFieldLines(record);
      if (extractor) {
        const { key, label, fields: out } = extractor.extract(
          record,
          fields,
          scope,
        );
        records.push({
          category: extractor.category,
          section: name,
          key: dedupe(usedKeys, name, key),
          label,
          fields: out,
          understood: true,
          startLine: record.startLine,
          endLine: record.endLine,
        });
      } else {
        const { key, label, fields: out } = fallbackExtract(name, record, fields);
        records.push({
          category: "other",
          section: name,
          key: dedupe(usedKeys, name, key),
          label,
          fields: out,
          understood: false,
          startLine: record.startLine,
          endLine: record.endLine,
        });
      }
    }
  }
  return { records };
}

function dedupe(used: Set<string>, section: string, key: string): string {
  let candidate = key;
  let i = 1;
  while (used.has(`${section}｜${candidate}`)) {
    candidate = `${key}#dup${i}`;
    i += 1;
  }
  used.add(`${section}｜${candidate}`);
  return candidate;
}

/** Find the semantic record spanning a 1-based line number (for UI linking). */
export function semanticAtLine(
  model: SemanticModel,
  lineNo: number,
): SemanticRecord | undefined {
  let lo = 0;
  let hi = model.records.length - 1;
  let candidate: SemanticRecord | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = model.records[mid];
    if (r.startLine <= lineNo) {
      candidate = r;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate && lineNo <= candidate.endLine) return candidate;
  return undefined;
}
