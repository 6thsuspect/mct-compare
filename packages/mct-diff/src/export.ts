import type { SemanticChange } from "@mct/shared-types";

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Render semantic changes as CSV: one row per changed field (presence-only
 * changes emit a single row with empty field cells) so the data opens
 * cleanly in Excel/Sheets.
 */
export function semanticCsv(changes: SemanticChange[]): string {
  const rows = [
    "status,category,section,key,label,field,before,after,aLines,bLines,note",
  ];
  for (const c of changes) {
    const base = [c.status, c.category, c.section, c.key, c.label]
      .map(csvCell)
      .join(",");
    const aLines = (c.aLines ?? []).join(";");
    const bLines = (c.bLines ?? []).join(";");
    const note = csvCell(c.note ?? "");
    if (!c.fields || c.fields.length === 0) {
      rows.push(`${base},,,,${aLines},${bLines},${note}`);
    } else {
      for (const f of c.fields) {
        rows.push(
          `${base},${csvCell(f.field)},${csvCell(f.before)},${csvCell(f.after)},${aLines},${bLines},${note}`,
        );
      }
    }
  }
  return rows.join("\r\n");
}

/** Render semantic changes as pretty-printed JSON. */
export function semanticJson(changes: SemanticChange[]): string {
  return JSON.stringify(changes, null, 2);
}
