import type { MctDocument } from "@mct/parser";
import type { TextDiffResult, TextHunk } from "@mct/shared-types";

export interface TextDiffOptions {
  /** Compare lines with all whitespace removed (visual comparison only). */
  ignoreWhitespace?: boolean;
}

/**
 * Myers O(ND) line diff with backtracking. Returns hunks of non-equal
 * regions plus an equal-line map for synchronized navigation.
 */
export function diffLines(
  a: string[],
  b: string[],
  options: TextDiffOptions = {},
): TextDiffResult {
  const key = options.ignoreWhitespace
    ? (s: string): string => s.replace(/\s+/g, "")
    : (s: string): string => s;
  const ak = a.map(key);
  const bk = b.map(key);

  // Shortest edit script via Myers greedy + trace.
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const trace: Map<number, number>[] = [];
  const v = new Map<number, number>();
  v.set(1, 0);
  let foundD = -1;
  outer: for (let d = 0; d <= max; d++) {
    const snapshot = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1))) {
        x = v.get(k + 1) ?? 0; // down (insertion)
      } else {
        x = (v.get(k - 1) ?? 0) + 1; // right (deletion)
      }
      let y = x - k;
      while (x < n && y < m && ak[x] === bk[y]) {
        x += 1;
        y += 1;
      }
      v.set(k, x);
      snapshot.set(k, x);
      if (x >= n && y >= m) {
        trace.push(snapshot);
        foundD = d;
        break outer;
      }
    }
    trace.push(snapshot);
  }
  if (foundD < 0) throw new Error("diff failed: no edit script found");

  // Backtrack to an edit script of ops.
  type Op = { op: "equal" | "del" | "ins"; a: number; b: number };
  const script: Op[] = [];
  let x = n;
  let y = m;
  for (let d = foundD; d > 0; d--) {
    const prev = trace[d - 1];
    const k = x - y;
    const down =
      k === -d || (k !== d && (prev.get(k - 1) ?? -1) < (prev.get(k + 1) ?? -1));
    const kPrev = down ? k + 1 : k - 1;
    const xPrev = prev.get(kPrev) ?? 0;
    const yPrev = xPrev - kPrev;
    while (x > xPrev && y > yPrev) {
      x -= 1;
      y -= 1;
      script.push({ op: "equal", a: x, b: y });
    }
    if (down) {
      y -= 1;
      script.push({ op: "ins", a: x, b: y });
    } else {
      x -= 1;
      script.push({ op: "del", a: x, b: y });
    }
  }
  while (x > 0 && y > 0) {
    x -= 1;
    y -= 1;
    script.push({ op: "equal", a: x, b: y });
  }
  script.reverse();

  // Fold the script into hunks + line map.
  const hunks: TextHunk[] = [];
  const lineMap: Array<[number, number]> = [];
  let i = 0;
  while (i < script.length) {
    const s = script[i];
    if (s.op === "equal") {
      lineMap.push([s.a, s.b]);
      i += 1;
      continue;
    }
    const aStart = s.op === "ins" ? s.a : s.a;
    const bStart = s.op === "del" ? s.b : s.b;
    const aSeg: string[] = [];
    const bSeg: string[] = [];
    let aEnd = aStart;
    let bEnd = bStart;
    while (i < script.length && script[i].op !== "equal") {
      const t = script[i];
      if (t.op === "del") {
        aSeg.push(a[t.a]);
        aEnd = t.a + 1;
      } else {
        bSeg.push(b[t.b]);
        bEnd = t.b + 1;
      }
      i += 1;
    }
    const hasA = aSeg.length > 0;
    const hasB = bSeg.length > 0;
    hunks.push({
      op: hasA && hasB ? "replace" : hasB ? "insert" : "delete",
      aStart,
      aEnd,
      bStart,
      bEnd,
      aLines: aSeg,
      bLines: bSeg,
    });
  }

  let added = 0;
  let deleted = 0;
  let modifiedBefore = 0;
  let modifiedAfter = 0;
  for (const h of hunks) {
    if (h.op === "insert") added += h.bLines.length;
    else if (h.op === "delete") deleted += h.aLines.length;
    else {
      modifiedBefore += h.aLines.length;
      modifiedAfter += h.bLines.length;
    }
  }
  return { hunks, added, deleted, modifiedBefore, modifiedAfter, lineMap };
}

/** Diff two parsed documents, annotating hunks with enclosing sections. */
export function diffDocuments(
  docA: MctDocument,
  docB: MctDocument,
  options: TextDiffOptions = {},
): TextDiffResult {
  const result = diffLines(
    docA.lines.map((l) => l.text),
    docB.lines.map((l) => l.text),
    options,
  );
  const atA = sectionIndex(docA);
  const atB = sectionIndex(docB);
  for (const h of result.hunks) {
    h.aSection = atA(Math.max(0, h.aStart - 1));
    h.bSection = atB(Math.max(0, h.bStart - 1));
  }
  return result;
}

/** Build a 0-based line -> section-name lookup. */
function sectionIndex(doc: MctDocument): (line0: number) => string | undefined {
  const spans = doc.sections.map((s) => ({
    name: s.header.name,
    from: s.startLine - 1,
    to: s.endLine - 1,
  }));
  return (line0: number): string | undefined => {
    for (let i = spans.length - 1; i >= 0; i--) {
      if (line0 >= spans[i].from) {
        return line0 <= spans[i].to ? spans[i].name : undefined;
      }
    }
    return undefined;
  };
}

/** Render hunks as a unified diff. */
export function toUnifiedDiff(
  nameA: string,
  nameB: string,
  aLines: string[],
  bLines: string[],
  hunks: TextHunk[],
  context = 3,
): string {
  const out: string[] = [`--- ${nameA}`, `+++ ${nameB}`];
  // Merge hunks whose context windows overlap.
  const groups: TextHunk[][] = [];
  for (const h of hunks) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && h.aStart - (prev.aEnd + context) <= context) {
      last.push(h);
    } else {
      groups.push([h]);
    }
  }
  for (const group of groups) {
    const first = group[0];
    const lastG = group[group.length - 1];
    const aFrom = Math.max(0, first.aStart - context);
    const bFrom = Math.max(0, first.bStart - context);
    const aTo = Math.min(aLines.length, lastG.aEnd + context);
    const bTo = Math.min(bLines.length, lastG.bEnd + context);
    out.push(
      `@@ -${aFrom + 1},${aTo - aFrom} +${bFrom + 1},${bTo - bFrom} @@`,
    );
    let ai = aFrom;
    let bi = bFrom;
    for (const h of group) {
      while (ai < h.aStart) {
        out.push(` ${aLines[ai]}`);
        ai += 1;
        bi += 1;
      }
      for (const l of h.aLines) out.push(`-${l}`);
      for (const l of h.bLines) out.push(`+${l}`);
      ai = h.aEnd;
      bi = h.bEnd;
    }
    while (ai < aTo) {
      out.push(` ${aLines[ai]}`);
      ai += 1;
      bi += 1;
    }
    void bTo;
    void bi;
  }
  return out.join("\n") + "\n";
}
