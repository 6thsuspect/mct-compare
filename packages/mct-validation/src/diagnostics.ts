import type {
  Diagnostic,
  Severity,
  ValidationReport,
} from "@mct/shared-types";

export function countBySeverity(
  diagnostics: Diagnostic[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    info: 0,
    warning: 0,
    error: 0,
    loss: 0,
  };
  for (const d of diagnostics) counts[d.severity] += 1;
  return counts;
}

/** Render a human-readable Markdown validation report. */
export function renderMarkdownValidationReport(
  report: ValidationReport,
): string {
  const lines: string[] = [];
  lines.push(`# MCT Validation Report`);
  lines.push(``);
  lines.push(`- File: \`${report.file}\``);
  lines.push(`- Detected version: ${report.detectedVersion}`);
  if (report.targetVersion) {
    lines.push(`- Compatibility target: ${report.targetVersion}`);
  }
  lines.push(
    `- File integrity (level 1): ${report.fileOk ? "PASS" : "FAIL"} — ` +
      `${report.stats.lines} lines, ${report.stats.sections} sections, ` +
      `${report.stats.records} records, ${report.stats.bytes} bytes`,
  );
  lines.push(
    `- Model integrity (level 2): ${report.counts.error + report.counts.loss === 0 ? "PASS" : "FAIL"} — ` +
      `${report.counts.error} error(s), ${report.counts.loss} blocking, ` +
      `${report.counts.warning} warning(s), ${report.counts.info} info`,
  );
  lines.push(``);
  const notable = report.diagnostics.filter((d) => d.severity !== "info");
  if (notable.length > 0) {
    lines.push(`## Findings`);
    lines.push(``);
    for (const d of notable.slice(0, 200)) {
      const where = [
        d.section ? `*${d.section}` : "",
        d.line !== undefined ? `line ${d.line}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(`- [${d.severity}] ${d.code}${where ? ` (${where})` : ""}: ${d.message}`);
    }
    if (notable.length > 200) {
      lines.push(`- … and ${notable.length - 200} further findings (see JSON report).`);
    }
    lines.push(``);
  } else {
    lines.push(`No errors or warnings.`);
    lines.push(``);
  }
  lines.push(
    `> Levels 3-4 (target-software acceptance, engineering verification) ` +
      `require the actual MIDAS CIVIL release and are never simulated here.`,
  );
  lines.push(``);
  return lines.join("\n");
}
