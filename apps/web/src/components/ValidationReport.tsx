import { useState } from "react";
import type { CivilVersion, Severity, ValidationReport as Report } from "@mct/shared-types";
import { download, engineApi } from "../engine";
import type { PickedFile } from "./FileDropZone";

const SEVERITY_STYLE: Record<Severity, string> = {
  info: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  loss: "bg-rose-200 text-rose-900",
};

export default function ValidationReport(props: {
  fileA: PickedFile | null;
  fileB: PickedFile | null;
}) {
  const [which, setWhich] = useState<"a" | "b">("a");
  const [target, setTarget] = useState<"" | CivilVersion>("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  const file = which === "a" ? props.fileA : props.fileB;

  const run = async (): Promise<void> => {
    if (!file) return;
    setRunning(true);
    setError(null);
    try {
      const r = await engineApi.validate(
        file.name,
        file.text,
        target === "" ? undefined : target,
      );
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const visible = (report?.diagnostics ?? []).filter(
    (d) => showInfo || d.severity !== "info",
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <label className="text-xs">
          File{" "}
          <select
            value={which}
            onChange={(e) => setWhich(e.target.value as "a" | "b")}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="a">A{props.fileA ? ` (${props.fileA.name})` : ""}</option>
            <option value="b">B{props.fileB ? ` (${props.fileB.name})` : ""}</option>
          </select>
        </label>
        <label className="text-xs">
          Compatibility target{" "}
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as "" | CivilVersion)}
            className="rounded border border-slate-300 bg-white px-2 py-1"
          >
            <option value="">None (model checks only)</option>
            <option value="2022">CIVIL 2022</option>
            <option value="2025">CIVIL 2025</option>
          </select>
        </label>
        <button
          disabled={!file || running}
          onClick={run}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {running ? "Validating…" : "Validate"}
        </button>
        {report && (
          <button
            className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm hover:bg-slate-100"
            onClick={() =>
              download(`${report.file}.validation.md`, markdown(report), "text/markdown")
            }
          >
            Export report (.md)
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {report && (
        <div className="space-y-3 text-sm">
          <div className="grid gap-2 text-center text-xs sm:grid-cols-4">
            <div className={`rounded px-2 py-2 font-semibold ${report.fileOk ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              Level 1 file integrity: {report.fileOk ? "PASS" : "FAIL"}
            </div>
            <div className={`rounded px-2 py-2 font-semibold ${report.counts.error + report.counts.loss === 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              Level 2 model integrity: {report.counts.error + report.counts.loss === 0 ? "PASS" : "FAIL"}
            </div>
            <div className="rounded bg-white px-2 py-2 ring-1 ring-slate-200">
              {report.stats.lines.toLocaleString()} lines · {report.stats.records.toLocaleString()} records
            </div>
            <div className="rounded bg-white px-2 py-2 ring-1 ring-slate-200">
              detected: {report.detectedVersion}
              {report.targetVersion ? ` · target: ${report.targetVersion}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
              {report.counts.error} errors
            </span>
            <span className="rounded bg-rose-200 px-2 py-0.5 font-semibold text-rose-900">
              {report.counts.loss} blocking
            </span>
            <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
              {report.counts.warning} warnings
            </span>
            <label className="flex items-center gap-1 text-slate-600">
              <input
                type="checkbox"
                checked={showInfo}
                onChange={(e) => setShowInfo(e.target.checked)}
              />
              show {report.counts.info} info
            </label>
          </div>

          <div className="rounded-lg border border-slate-300 bg-white text-xs">
            {visible.length === 0 && (
              <div className="px-3 py-6 text-center text-slate-500">
                No findings at the current filter level.
              </div>
            )}
            {visible.slice(0, 500).map((d, i) => (
              <div key={i} className="flex gap-2 border-b border-slate-100 px-3 py-1.5">
                <span className={`h-fit rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[d.severity]}`}>
                  {d.severity}
                </span>
                <span className="h-fit font-mono text-slate-500">{d.code}</span>
                <span>
                  {d.message}
                  <span className="ml-2 text-slate-400">
                    {[d.section ? `*${d.section}` : "", d.line !== undefined ? `line ${d.line}` : ""]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                  {d.hint && <span className="ml-2 italic text-slate-500">{d.hint}</span>}
                </span>
              </div>
            ))}
            {visible.length > 500 && (
              <div className="px-3 py-2 text-slate-500">
                … {visible.length - 500} further findings.
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Levels 3–4 (target-software acceptance, engineering verification) require the
            actual MIDAS CIVIL release and appropriately controlled test cases — they are
            never simulated by this tool. Only claim the highest level actually tested.
          </div>
        </div>
      )}
    </div>
  );
}

function markdown(report: Report): string {
  const lines: string[] = [];
  lines.push(`# MCT Validation Report`);
  lines.push(``);
  lines.push(`- File: \`${report.file}\``);
  lines.push(`- Detected version: ${report.detectedVersion}`);
  if (report.targetVersion) lines.push(`- Compatibility target: ${report.targetVersion}`);
  lines.push(
    `- Level 1 file integrity: ${report.fileOk ? "PASS" : "FAIL"} (${report.stats.lines} lines, ${report.stats.records} records)`,
  );
  lines.push(
    `- Level 2 model integrity: ${report.counts.error} error(s), ${report.counts.loss} blocking, ${report.counts.warning} warning(s)`,
  );
  lines.push(``);
  for (const d of report.diagnostics.filter((d) => d.severity !== "info")) {
    lines.push(`- [${d.severity}] ${d.code}: ${d.message}`);
  }
  lines.push(``);
  return lines.join("\n");
}
