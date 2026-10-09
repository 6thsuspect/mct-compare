import { splitFields, type MctRecord } from "@mct/parser";

/**
 * Normalise a field value for semantic comparison: trim and collapse all
 * whitespace. Deliberately does NOT touch numbers (no precision, unit or
 * sign normalisation) so real structural differences can never hide.
 */
export function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Split all logical lines of a record into normalised fields. */
export function recordFieldLines(record: MctRecord): string[][] {
  return record.logicalLines.map((line) =>
    splitFields(line.replace(/\n/g, " ")).map(normalizeValue),
  );
}

/** Name positional fields c1..cN, optionally with leading aliases. */
export function namedFields(
  values: string[],
  aliases: string[] = [],
  prefix = "",
): Array<[string, string]> {
  return values.map(
    (value, i) =>
      [prefix + (aliases[i] ?? `c${i + 1}`), value] as [string, string],
  );
}

/** Parse a `KEY=value` field (case-insensitive key). */
export function keyValue(field: string): { key: string; value: string } | null {
  const eq = field.indexOf("=");
  if (eq < 0) return null;
  return {
    key: field.slice(0, eq).trim().toUpperCase(),
    value: field.slice(eq + 1).trim(),
  };
}

/** Tracks per-section occurrence counters for stable duplicate-proof keys. */
export class KeyScope {
  private counts = new Map<string, number>();

  /** Next 0-based occurrence index for `section|base`. */
  next(section: string, base: string): number {
    const k = `${section}｜${base}`;
    const n = this.counts.get(k) ?? 0;
    this.counts.set(k, n + 1);
    return n;
  }

  /** Suffix `#n` when n > 0, else the bare base. */
  static suffixed(base: string, n: number): string {
    return n === 0 ? base : `${base}#${n}`;
  }
}
