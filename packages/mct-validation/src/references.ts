import {
  getSections,
  splitFields,
  type MctDocument,
  type MctRecord,
} from "@mct/parser";
import type { Diagnostic } from "@mct/shared-types";

/**
 * Level-2 checks: identifier, connectivity and cross-reference integrity.
 * Every check is conservative — it only flags references it can resolve
 * unambiguously, and caps output so hostile files cannot flood the report.
 */

const MAX_PER_CODE = 25;

export function validateReferences(doc: MctDocument): Diagnostic[] {
  const out: Diagnostic[] = [];
  const counts = new Map<string, number>();
  const push = (d: Diagnostic): void => {
    const n = counts.get(d.code) ?? 0;
    if (n >= MAX_PER_CODE) return;
    counts.set(d.code, n + 1);
    out.push(
      n === MAX_PER_CODE - 1
        ? { ...d, message: d.message + " (further findings of this type suppressed)" }
        : d,
    );
  };

  const nodes = intIdSet(doc, "NODE", push, "MCT-REF-010", "node");
  const elements = elementIndex(doc, push);
  const materials = intIdSet(doc, "MATERIAL", push, "MCT-REF-011", "material");
  const sections = sectionIdSet(doc, push);
  const dgnSectIds = recordIdSet(doc, "DGN-SECT");
  const cases = nameSet(doc, "STLDCASE", 0);
  const loadGroups = nameSet(doc, "LOAD-GROUP", 0);
  const bndrGroups = nameSet(doc, "BNDR-GROUP", 0);
  const groupNames = nameSet(doc, "GROUP", 0);
  const combos = loadcombNames(doc);

  checkElements(doc, elements, nodes, materials, sections, push);
  checkDuplicates(doc, nodes, elements, materials, sections, push);
  checkSupports(doc, nodes, bndrGroups, push);
  checkFrameRls(doc, elements, push);
  checkBeamloads(doc, elements, loadGroups, push);
  checkUseStld(doc, cases, push);
  checkLoadToMass(doc, cases, push);
  checkLoadcombs(doc, cases, combos, push);
  checkGroups(doc, nodes, elements, groupNames, push);
  checkLengthSections(doc, elements, push);
  checkDesignSections(doc, materials, sections, dgnSectIds, materials, push);
  checkColors(doc, sections, materials, cases, combos, push);

  return out;
}

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

function firstLines(doc: MctDocument, name: string): MctRecord[] {
  return getSections(doc, name).flatMap((s) => s.records);
}

function recordIdSet(doc: MctDocument, name: string): Set<number> {
  const ids = new Set<number>();
  for (const r of firstLines(doc, name)) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id !== null) ids.add(id);
  }
  return ids;
}

function intIdSet(
  doc: MctDocument,
  name: string,
  push: (d: Diagnostic) => void,
  dupCode: string,
  what: string,
): Set<number> {
  const ids = new Set<number>();
  for (const r of firstLines(doc, name)) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id === null) continue;
    if (ids.has(id)) {
      push({
        code: dupCode,
        severity: "error",
        message: `Duplicate ${what} id ${id}.`,
        section: name,
        line: r.startLine,
        recordKey: String(id),
      });
    }
    ids.add(id);
  }
  return ids;
}

interface ElementInfo {
  id: number;
  type: string;
  mat: number | null;
  sec: number | null;
  nodes: number[];
  line: number;
}

function elementIndex(
  doc: MctDocument,
  push: (d: Diagnostic) => void,
): Map<number, ElementInfo> {
  const map = new Map<number, ElementInfo>();
  for (const r of firstLines(doc, "ELEMENT")) {
    const f = splitFields(r.lines[0] ?? "");
    const id = parseId(f[0]);
    if (id === null) continue;
    if (map.has(id)) {
      push({
        code: "MCT-REF-012",
        severity: "error",
        message: `Duplicate element id ${id}.`,
        section: "ELEMENT",
        line: r.startLine,
        recordKey: String(id),
      });
    }
    map.set(id, {
      id,
      type: (f[1] ?? "").toUpperCase(),
      mat: parseId(f[2]),
      sec: parseId(f[3]),
      nodes: [f[4], f[5], f[6], f[7]]
        .map(parseId)
        .filter((n): n is number => n !== null && n !== 0),
      line: r.startLine,
    });
  }
  return map;
}

/** SECTION ids from record header lines only (followers excluded). */
function sectionIdSet(
  doc: MctDocument,
  push: (d: Diagnostic) => void,
): Set<number> {
  const ids = new Set<number>();
  for (const r of firstLines(doc, "SECTION")) {
    const f = splitFields(r.lines[0] ?? "");
    const id = parseId(f[0]);
    if (id === null || !/^[A-Z]/i.test((f[1] ?? "").trim())) continue;
    if (ids.has(id)) {
      push({
        code: "MCT-REF-013",
        severity: "error",
        message: `Duplicate section id ${id}.`,
        section: "SECTION",
        line: r.startLine,
        recordKey: String(id),
      });
    }
    ids.add(id);
  }
  return ids;
}

function nameSet(doc: MctDocument, name: string, field: number): Set<string> {
  const out = new Set<string>();
  for (const r of firstLines(doc, name)) {
    const v = splitFields(r.logicalLines[0]?.replace(/\n/g, " ") ?? "")[field];
    if (v !== undefined && v !== "") out.add(v);
  }
  return out;
}

function loadcombNames(doc: MctDocument): Set<string> {
  const out = new Set<string>();
  for (const r of firstLines(doc, "LOADCOMB")) {
    const head = splitFields(r.lines[0] ?? "")[0] ?? "";
    const m = /^\s*NAME\s*=\s*(.+?)\s*$/i.exec(head);
    if (m) out.add(m[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkElements(
  doc: MctDocument,
  elements: Map<number, ElementInfo>,
  nodes: Set<number>,
  materials: Set<number>,
  sections: Set<number>,
  push: (d: Diagnostic) => void,
): void {
  void doc;
  for (const el of elements.values()) {
    if (el.mat !== null && !materials.has(el.mat)) {
      push({
        code: "MCT-ELEM-001",
        severity: "error",
        message: `Element ${el.id} references missing material ${el.mat}.`,
        section: "ELEMENT",
        line: el.line,
        recordKey: String(el.id),
      });
    }
    if (el.sec !== null && !sections.has(el.sec)) {
      push({
        code: "MCT-ELEM-002",
        severity: "error",
        message: `Element ${el.id} references missing section ${el.sec}.`,
        section: "ELEMENT",
        line: el.line,
        recordKey: String(el.id),
      });
    }
    for (const n of el.nodes) {
      if (!nodes.has(n)) {
        push({
          code: "MCT-ELEM-003",
          severity: "error",
          message: `Element ${el.id} references missing node ${n}.`,
          section: "ELEMENT",
          line: el.line,
          recordKey: String(el.id),
        });
      }
    }
    if (el.nodes.length === 0) {
      push({
        code: "MCT-ELEM-004",
        severity: "warning",
        message: `Element ${el.id} has no node connectivity.`,
        section: "ELEMENT",
        line: el.line,
        recordKey: String(el.id),
      });
    }
  }
}

function checkDuplicates(
  doc: MctDocument,
  nodes: Set<number>,
  elements: Map<number, ElementInfo>,
  materials: Set<number>,
  sections: Set<number>,
  push: (d: Diagnostic) => void,
): void {
  void nodes;
  void elements;
  void materials;
  void sections;
  // Name-based duplicates.
  const pairs: Array<[string, number, string, string]> = [
    ["STLDCASE", 0, "MCT-REF-020", "load case"],
    ["GROUP", 0, "MCT-REF-021", "group"],
    ["LOAD-GROUP", 0, "MCT-REF-022", "load group"],
    ["BNDR-GROUP", 0, "MCT-REF-023", "boundary group"],
  ];
  for (const [section, field, code, what] of pairs) {
    const seen = new Set<string>();
    for (const r of firstLines(doc, section)) {
      const v = splitFields(r.logicalLines[0]?.replace(/\n/g, " ") ?? "")[field];
      if (!v) continue;
      if (seen.has(v)) {
        push({
          code,
          severity: "error",
          message: `Duplicate ${what} "${v}".`,
          section,
          line: r.startLine,
          recordKey: v,
        });
      }
      seen.add(v);
    }
  }
  // ELASTICLINK ids.
  const seen = new Set<number>();
  for (const r of firstLines(doc, "ELASTICLINK")) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id === null) continue;
    if (seen.has(id)) {
      push({
        code: "MCT-REF-024",
        severity: "error",
        message: `Duplicate elastic link id ${id}.`,
        section: "ELASTICLINK",
        line: r.startLine,
        recordKey: String(id),
      });
    }
    seen.add(id);
  }
}

function checkSupports(
  doc: MctDocument,
  nodes: Set<number>,
  bndrGroups: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  for (const r of firstLines(doc, "CONSTRAINT")) {
    const f = splitFields(r.lines[0] ?? "");
    for (const n of expandIdList(f[0] ?? "")) {
      if (!nodes.has(n)) {
        push({
          code: "MCT-BNDR-001",
          severity: "error",
          message: `Support references missing node ${n}.`,
          section: "CONSTRAINT",
          line: r.startLine,
        });
      }
    }
    checkBndrGroup(f[2] ?? "", "CONSTRAINT", r.startLine, bndrGroups, push);
  }
  for (const r of firstLines(doc, "SPRING")) {
    const f = splitFields(r.lines[0] ?? "");
    const type = (f[1] ?? "").toUpperCase();
    for (const n of expandIdList(f[0] ?? "")) {
      if (!nodes.has(n)) {
        push({
          code: "MCT-BNDR-002",
          severity: "error",
          message: `Point spring references missing node ${n}.`,
          section: "SPRING",
          line: r.startLine,
        });
      }
    }
    // LINEAR layout carries GROUP at field 21; other layouts differ and are skipped.
    if (type === "LINEAR" && f.length > 21) {
      checkBndrGroup(f[21] ?? "", "SPRING", r.startLine, bndrGroups, push);
    }
  }
  for (const r of firstLines(doc, "ELASTICLINK")) {
    const f = splitFields(r.lines[0] ?? "");
    for (const field of [f[1], f[2]]) {
      const n = parseId(field ?? "");
      if (n !== null && !nodes.has(n)) {
        push({
          code: "MCT-BNDR-003",
          severity: "error",
          message: `Elastic link ${f[0]} references missing node ${n}.`,
          section: "ELASTICLINK",
          line: r.startLine,
          recordKey: f[0],
        });
      }
    }
    // RIGID/SADDLE layout carries GROUP at field 8.
    const type = (f[3] ?? "").toUpperCase();
    if ((type === "RIGID" || type === "SADDLE") && f.length > 8) {
      checkBndrGroup(f[8] ?? "", "ELASTICLINK", r.startLine, bndrGroups, push);
    }
  }
}

function checkBndrGroup(
  group: string,
  section: string,
  line: number,
  bndrGroups: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  if (group !== "" && !bndrGroups.has(group)) {
    push({
      code: "MCT-BNDR-010",
      severity: "warning",
      message: `${section} references unknown boundary group "${group}".`,
      section,
      line,
    });
  }
}

function checkFrameRls(
  doc: MctDocument,
  elements: Map<number, ElementInfo>,
  push: (d: Diagnostic) => void,
): void {
  for (const r of firstLines(doc, "FRAME-RLS")) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id !== null && !elements.has(id)) {
      push({
        code: "MCT-BNDR-020",
        severity: "error",
        message: `Beam end release references missing element ${id}.`,
        section: "FRAME-RLS",
        line: r.startLine,
        recordKey: String(id),
      });
    }
  }
}

function checkBeamloads(
  doc: MctDocument,
  elements: Map<number, ElementInfo>,
  loadGroups: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  for (const r of firstLines(doc, "BEAMLOAD")) {
    const f = splitFields(r.lines[0] ?? "");
    const id = parseId(f[0]);
    if (id !== null && !elements.has(id)) {
      push({
        code: "MCT-LOAD-001",
        severity: "error",
        message: `Beam load references missing element ${id}.`,
        section: "BEAMLOAD",
        line: r.startLine,
        recordKey: String(id),
      });
    }
    // Uniform reference layout carries GROUP at field 18.
    if (f.length === 24 && f[18] !== "" && !loadGroups.has(f[18])) {
      push({
        code: "MCT-LOAD-002",
        severity: "warning",
        message: `Beam load on element ${f[0]} references unknown load group "${f[18]}".`,
        section: "BEAMLOAD",
        line: r.startLine,
        recordKey: f[0],
      });
    }
  }
}

function checkUseStld(
  doc: MctDocument,
  cases: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  for (const s of getSections(doc, "USE-STLD")) {
    for (const arg of s.header.args) {
      if (!cases.has(arg)) {
        push({
          code: "MCT-LOAD-003",
          severity: "error",
          message: `USE-STLD references unknown load case "${arg}".`,
          section: "USE-STLD",
          line: s.startLine,
        });
      }
    }
  }
}

function checkLoadToMass(
  doc: MctDocument,
  cases: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  for (const r of firstLines(doc, "LOADTOMASS")) {
    const f = splitFields(r.lines[0] ?? "");
    if (f.length < 2 || /^[A-Z]+$/.test(f[0] ?? "") && f[1]?.toUpperCase() !== f[1]) {
      // Heuristic: the DIR line (XYZ, YES, ...) is not a case/factor list.
    }
    if ((f[0] ?? "").toUpperCase() === f[0] && /^(X|Y|Z|XYZ)$/.test((f[0] ?? "").toUpperCase())) {
      continue; // direction control line
    }
    for (let i = 0; i < f.length; i += 2) {
      const name = f[i];
      if (name === "" || name === undefined) continue;
      if (!cases.has(name)) {
        push({
          code: "MCT-LOAD-004",
          severity: "error",
          message: `Load-to-mass references unknown load case "${name}".`,
          section: "LOADTOMASS",
          line: r.startLine,
        });
      }
    }
  }
}

function checkLoadcombs(
  doc: MctDocument,
  cases: Set<string>,
  combos: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  for (const r of firstLines(doc, "LOADCOMB")) {
    for (const line of r.lines.slice(1)) {
      const f = splitFields(line);
      // Factor lines read ANAL, LCNAME, FACT, ... in triples.
      for (let i = 0; i + 2 < f.length + 1; i += 3) {
        const lcname = f[i + 1];
        if (lcname === undefined || lcname === "") continue;
        if (!cases.has(lcname) && !combos.has(lcname)) {
          push({
            code: "MCT-LOAD-010",
            severity: "error",
            message: `Load combination references unknown case "${lcname}".`,
            section: "LOADCOMB",
            line: r.startLine,
          });
        }
      }
    }
  }
}

function checkGroups(
  doc: MctDocument,
  nodes: Set<number>,
  elements: Map<number, ElementInfo>,
  _groupNames: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  void _groupNames;
  for (const r of firstLines(doc, "GROUP")) {
    const f = splitFields(r.logicalLines[0]?.replace(/\n/g, " ") ?? "");
    const name = f[0] ?? "";
    for (const n of expandIdList(f[1] ?? "")) {
      if (!nodes.has(n)) {
        push({
          code: "MCT-GRP-001",
          severity: "error",
          message: `Group "${name}" references missing node ${n}.`,
          section: "GROUP",
          line: r.startLine,
          recordKey: name,
        });
      }
    }
    for (const e of expandIdList(f[2] ?? "")) {
      if (!elements.has(e)) {
        push({
          code: "MCT-GRP-002",
          severity: "error",
          message: `Group "${name}" references missing element ${e}.`,
          section: "GROUP",
          line: r.startLine,
          recordKey: name,
        });
      }
    }
  }
}

function checkLengthSections(
  doc: MctDocument,
  elements: Map<number, ElementInfo>,
  push: (d: Diagnostic) => void,
): void {
  for (const name of ["LENGTH", "LIMITSRATIO"] as const) {
    for (const r of firstLines(doc, name)) {
      const f = splitFields(r.lines[0] ?? "");
      for (const e of expandIdList(f[0] ?? "")) {
        if (!elements.has(e)) {
          push({
            code: name === "LENGTH" ? "MCT-DGN-010" : "MCT-DGN-011",
            severity: "warning",
            message: `${name} references unknown element ${e}.`,
            section: name,
            line: r.startLine,
          });
        }
      }
    }
  }
}

function checkDesignSections(
  doc: MctDocument,
  _materials: Set<number>,
  sections: Set<number>,
  dgnSectIds: Set<number>,
  _materials2: Set<number>,
  push: (d: Diagnostic) => void,
): void {
  void _materials;
  void _materials2;
  const materials = recordIdSet(doc, "MATERIAL");
  for (const r of firstLines(doc, "DGN-MATL")) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id !== null && !materials.has(id)) {
      push({
        code: "MCT-DGN-001",
        severity: "error",
        message: `Design material ${id} has no matching MATERIAL definition.`,
        section: "DGN-MATL",
        line: r.startLine,
        recordKey: String(id),
      });
    }
  }
  for (const id of dgnSectIds) {
    if (!sections.has(id)) {
      push({
        code: "MCT-DGN-002",
        severity: "error",
        message: `Design section ${id} has no matching SECTION definition.`,
        section: "DGN-SECT",
        recordKey: String(id),
      });
    }
  }
  for (const r of firstLines(doc, "COMP-GEN-SECT-PSC-DESIGN")) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id !== null && !sections.has(id)) {
      push({
        code: "MCT-DGN-003",
        severity: "error",
        message: `Composite PSC design entry references missing section ${id}.`,
        section: "COMP-GEN-SECT-PSC-DESIGN",
        line: r.startLine,
        recordKey: String(id),
      });
    }
  }
}

function checkColors(
  doc: MctDocument,
  sections: Set<number>,
  materials: Set<number>,
  cases: Set<string>,
  combos: Set<string>,
  push: (d: Diagnostic) => void,
): void {
  for (const r of firstLines(doc, "SECT-COLOR")) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id !== null && !sections.has(id)) {
      push({
        code: "MCT-COL-001",
        severity: "warning",
        message: `Section color entry references missing section ${id}.`,
        section: "SECT-COLOR",
        line: r.startLine,
      });
    }
  }
  for (const r of firstLines(doc, "MATL-COLOR")) {
    const id = parseId(splitFields(r.lines[0] ?? "")[0]);
    if (id !== null && !materials.has(id)) {
      push({
        code: "MCT-COL-002",
        severity: "warning",
        message: `Material color entry references missing material ${id}.`,
        section: "MATL-COLOR",
        line: r.startLine,
      });
    }
  }
  for (const r of firstLines(doc, "LC-COLOR")) {
    const f = splitFields(r.lines[0] ?? "");
    const anal = (f[0] ?? "").toUpperCase();
    const name = f[1] ?? "";
    if (anal === "CBS") {
      if (name !== "" && !combos.has(name)) {
        push({
          code: "MCT-COL-003",
          severity: "warning",
          message: `Load-color entry references unknown combination "${name}".`,
          section: "LC-COLOR",
          line: r.startLine,
        });
      }
    } else if (name !== "" && !cases.has(name)) {
      push({
        code: "MCT-COL-004",
        severity: "warning",
        message: `Load-color entry references unknown load case "${name}".`,
        section: "LC-COLOR",
        line: r.startLine,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a strict integer id (rejects floats, blanks, garbage). */
function parseId(text: string): number | null {
  const t = text.trim();
  if (!/^-?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Expand an MCT id list: space-separated tokens of the forms `N`,
 * `AtoB` and `AtoBbyC` (ascending or descending).
 */
export function expandIdList(list: string): number[] {
  const out: number[] = [];
  for (const token of list.split(/\s+/)) {
    const t = token.trim().replace(/,$/, "");
    if (t === "") continue;
    const m = /^(\d+)[tT][oO](\d+)(?:[bB][yY](\d+))?$/.exec(t);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const step = m[3] !== undefined ? Number(m[3]) : 1;
      if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || step < 1) {
        continue;
      }
      // Guard against hostile ranges (e.g. 1to999999999).
      if (Math.abs(b - a) / step > 200000) continue;
      if (a <= b) {
        for (let n = a; n <= b; n += step) out.push(n);
      } else {
        for (let n = a; n >= b; n -= step) out.push(n);
      }
      continue;
    }
    const n = parseId(t);
    if (n !== null) out.push(n);
  }
  return out;
}
