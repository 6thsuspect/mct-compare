import type { ConversionReport } from "@mct/shared-types";
import { adapterFor } from "./version";

/** Render a human-readable Markdown conversion report. */
export function renderMarkdownReport(
  report: ConversionReport,
  sourceName: string,
): string {
  const lines: string[] = [];
  lines.push(`# MCT Conversion Report`);
  lines.push(``);
  lines.push(`- Source file: \`${sourceName}\``);
  lines.push(`- Direction: ${adapterFor(report.from).label} → ${adapterFor(report.to).label}`);
  lines.push(`- Detected source version: ${report.detectedSourceVersion}`);
  lines.push(`- Records examined: ${report.recordsExamined}`);
  lines.push(`- Records changed: ${report.recordsChanged}`);
  lines.push(`- Audit entries: ${report.applied.length}`);
  lines.push(`- Verdict: ${report.ok ? "OK" : "BLOCKED — see error/loss diagnostics"}`);
  lines.push(``);

  if (report.skippedProvisional.length > 0) {
    lines.push(`## Skipped provisional rules (need review)`);
    lines.push(``);
    for (const s of report.skippedProvisional) {
      lines.push(`- **${s.ruleId}** (${s.section}): ${s.message}`);
    }
    lines.push(``);
  }

  const notable = report.diagnostics.filter((d) => d.severity !== "info");
  if (notable.length > 0) {
    lines.push(`## Diagnostics`);
    lines.push(``);
    for (const d of notable) {
      const where = d.line !== undefined ? `line ${d.line}` : (d.section ?? "");
      lines.push(`- [${d.severity}] ${d.code} ${where}: ${d.message}`);
    }
    lines.push(``);
  }

  const dataEdits = report.applied.filter((a) => a.ruleId !== "MCT-CVT-100");
  const commentEdits = report.applied.filter((a) => a.ruleId === "MCT-CVT-100");
  lines.push(`## Applied rules (${dataEdits.length} data, ${commentEdits.length} comment)`);
  lines.push(``);
  const byRule = new Map<string, number>();
  for (const a of report.applied) {
    byRule.set(a.ruleId, (byRule.get(a.ruleId) ?? 0) + 1);
  }
  for (const [ruleId, count] of [...byRule].sort()) {
    const sample = report.applied.find((a) => a.ruleId === ruleId);
    lines.push(`- **${ruleId}** × ${count}: ${sample?.message ?? ""}`);
  }
  lines.push(``);
  lines.push(`## Audit trail (data records)`);
  lines.push(``);
  const shown = dataEdits.slice(0, 60);
  for (const a of shown) {
    lines.push(`- ${a.ruleId} ${a.section} lines ${a.startLine}-${a.endLine}`);
    for (const b of a.before) lines.push(`  - before: \`${b.trim()}\``);
    for (const c of a.after) lines.push(`  - after: \`${c.trim()}\``);
  }
  if (dataEdits.length > shown.length) {
    lines.push(`- … and ${dataEdits.length - shown.length} further entries (see JSON report).`);
  }
  lines.push(``);
  lines.push(
    `> Validation levels: file integrity and target-parser syntax (levels 1-2) ` +
      `can be checked with \`mct validate\`. Target-software acceptance and ` +
      `engineering verification (levels 3-4) require the actual MIDAS CIVIL ` +
      `release and are never simulated by this report.`,
  );
  lines.push(``);
  return lines.join("\n");
}
