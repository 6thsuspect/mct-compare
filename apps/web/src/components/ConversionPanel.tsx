import { useMemo, useState } from "react";
import type {
  CivilVersion,
  ConversionReport,
  Severity,
  ValidationReport,
} from "@mct/shared-types";
import {
  download,
  engineApi,
  useEngine,
  type Inventory,
  type RuleInfo,
} from "../engine";
import FileDropZone, { type PickedFile } from "./FileDropZone";

const SEVERITY_STYLE: Record<Severity, string> = {
  info: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-800",
  error: "bg-red-100 text-red-800",
  loss: "bg-rose-200 text-rose-900",
};

type Source = "a" | "b" | "new";
type FromChoice = CivilVersion | "auto";

const opposite = (v: CivilVersion): CivilVersion =>
  v === "2022" ? "2025" : "2022";

export default function ConversionPanel(props: {
  fileA: PickedFile | null;
  fileB: PickedFile | null;
  detectedA: string;
  detectedB: string;
  evidenceA: string[];
  evidenceB: string[];
  stampA: string | null;
  stampB: string | null;
  rules: RuleInfo[];
  onAdoptOutput: (name: string, text: string) => void;
}) {
  const [source, setSource] = useState<Source>(props.fileA ? "a" : "new");
  const [extraFile, setExtraFile] = useState<PickedFile | null>(null);
  const [from, setFrom] = useState<FromChoice>("auto");
  const [to, setTo] = useState<CivilVersion>("2025");
  const [includeProvisional, setIncludeProvisional] = useState(false);
  const [refreshComments, setRefreshComments] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Set<Severity>>(
    new Set(["info", "warning", "error", "loss"]),
  );

  const invExtra = useEngine<Inventory>(
    extraFile ? `X:${extraFile.name}:${extraFile.text.length}` : null,
    () => engineApi.inventory(extraFile!.name, extraFile!.text),
  );

  const sourceFile = source === "a" ? props.fileA : source === "b" ? props.fileB : extraFile;
  const detected =
    source === "a"
      ? props.detectedA
      : source === "b"
        ? props.detectedB
        : (invExtra.data?.detected ?? "…");
  const evidence =
    source === "a"
      ? props.evidenceA
      : source === "b"
        ? props.evidenceB
        : (invExtra.data?.evidence ?? []);
  const stamp =
    source === "a"
      ? props.stampA
      : source === "b"
        ? props.stampB
        : (invExtra.data?.versionString ?? null);

  const effectiveFrom: CivilVersion | null =
    from === "auto"
      ? detected === "2022" || detected === "2025"
        ? detected
        : null
      : from;

  // Pre-flight: validate the source (with compat probes for the target)
  // automatically so problems surface before converting.
  const preflight = useEngine<ValidationReport>(
    sourceFile ? `pre:${sourceFile.name}:${sourceFile.text.length}:${to}` : null,
    () => engineApi.validate(sourceFile!.name, sourceFile!.text, to),
  );

  const pickSource = (s: Source): void => {
    setSource(s);
    setReport(null);
    const d = s === "a" ? props.detectedA : s === "b" ? props.detectedB : invExtra.data?.detected;
    if (d === "2022" || d === "2025") setTo(opposite(d));
  };

  const run = async (dryRun: boolean): Promise<void> => {
    if (!sourceFile || !effectiveFrom) return;
    setRunning(true);
    setError(null);
    try {
      const r = await engineApi.convert({
        name: sourceFile.name,
        text: sourceFile.text,
        from: effectiveFrom,
        to,
        includeProvisional,
        refreshComments,
        dryRun,
      });
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const byRule = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of report?.applied ?? []) {
      map.set(a.ruleId, (map.get(a.ruleId) ?? 0) + 1);
    }
    return [...map.entries()].sort();
  }, [report]);

  const auditShown = useMemo(
    () =>
      (report?.applied ?? []).filter(
        (a) => severityFilter.has(a.severity) && a.ruleId !== "MCT-CVT-100",
      ),
    [report, severityFilter],
  );
  const commentEdits = (report?.applied ?? []).filter(
    (a) => a.ruleId === "MCT-CVT-100",
  ).length;

  const toggleSeverity = (s: Severity): void => {
    setSeverityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const ruleInfo = (id: string): RuleInfo | undefined =>
    props.rules.find(
      (r) => r.id === id && r.from === effectiveFrom && r.to === to,
    );

  const preflightCounts = preflight.data?.counts;
  const preflightBad =
    (preflightCounts?.error ?? 0) + (preflightCounts?.loss ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm md:grid-cols-2">
        <div className="space-y-2">
          <div>
            <span className="text-xs font-medium text-slate-600">Source file: </span>
            <label className="mr-3 text-xs">
              <input
                type="radio"
                checked={source === "a"}
                onChange={() => pickSource("a")}
                disabled={!props.fileA}
                className="mr-1"
              />
              A{props.fileA ? ` (${props.fileA.name})` : " (empty)"}
            </label>
            <label className="mr-3 text-xs">
              <input
                type="radio"
                checked={source === "b"}
                onChange={() => pickSource("b")}
                disabled={!props.fileB}
                className="mr-1"
              />
              B{props.fileB ? ` (${props.fileB.name})` : " (empty)"}
            </label>
            <label className="text-xs">
              <input
                type="radio"
                checked={source === "new"}
                onChange={() => pickSource("new")}
                className="mr-1"
              />
              Another file…
            </label>
          </div>

          {source === "new" && (
            <div className="rounded-md border border-blue-200 bg-white p-3">
              <FileDropZone
                label="Upload any .mct file to convert (need not match A/B)"
                accent="blue"
                file={extraFile}
                onPick={(f) => {
                  setExtraFile(f);
                  setReport(null);
                }}
                onClear={() => {
                  setExtraFile(null);
                  setReport(null);
                }}
              />
              {invExtra.loading && (
                <div className="mt-1 text-xs text-slate-500">Analysing…</div>
              )}
              {invExtra.data && (
                <div className="mt-1 text-xs text-slate-500">
                  {invExtra.data.lines.toLocaleString()} lines ·{" "}
                  {invExtra.data.records.toLocaleString()} records ·{" "}
                  {invExtra.data.sections.length} sections
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs">
            <label>
              From{" "}
              <select
                value={from}
                onChange={(e) => setFrom(e.target.value as FromChoice)}
                className="rounded border border-slate-300 bg-white px-2 py-1"
              >
                <option value="auto">Auto-detect</option>
                <option value="2022">CIVIL 2022</option>
                <option value="2025">CIVIL 2025</option>
              </select>
            </label>
            <span>→</span>
            <label>
              To{" "}
              <select
                value={to}
                onChange={(e) => setTo(e.target.value as CivilVersion)}
                className="rounded border border-slate-300 bg-white px-2 py-1"
              >
                <option value="2025">CIVIL 2025</option>
                <option value="2022">CIVIL 2022</option>
              </select>
            </label>
            <span className="text-slate-500">
              detected:{" "}
              <span className="font-semibold">
                {detected}
                {stamp ? ` (${stamp})` : ""}
              </span>
              {from === "auto" && effectiveFrom && ` · converting from ${effectiveFrom}`}
            </span>
          </div>

          {evidence.length > 0 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">
                Why {detected === "unknown" ? "detection failed" : `detected as ${detected}`}
              </summary>
              <ul className="ml-4 list-disc">
                {evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
          {sourceFile && !effectiveFrom && (
            <div className="rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900 ring-1 ring-amber-200">
              Version could not be detected automatically — pick “From” manually
              to convert.
            </div>
          )}

          {preflight.data && preflightCounts && (
            <div
              className={`rounded px-2 py-1.5 text-xs ring-1 ${
                preflightBad
                  ? "bg-red-50 text-red-900 ring-red-200"
                  : "bg-green-50 text-green-900 ring-green-200"
              }`}
            >
              Pre-flight vs CIVIL {to}: {preflightCounts.error} error(s),{" "}
              {preflightCounts.loss} blocking, {preflightCounts.warning} warning(s)
              {preflightBad
                ? " — resolve these before converting (see the Validate tab)."
                : " — clean."}
            </div>
          )}
        </div>
        <div className="space-y-2 text-xs">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeProvisional}
              onChange={(e) => setIncludeProvisional(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">Include provisional rules</span> (MCT-CVT-003
              BEAMLOAD, MCT-CVT-005 DGN-MATL) — evidence-backed but undocumented;
              requires engineering review.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={refreshComments}
              onChange={(e) => setRefreshComments(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-semibold">Refresh comment templates</span> (MCT-CVT-100,
              cosmetic) — rewrites `;` schema docs to the target generation's wording.
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={!sourceFile || !effectiveFrom || running}
          onClick={() => run(true)}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-40"
        >
          {running ? "Working…" : "Dry-run preview"}
        </button>
        <button
          disabled={!sourceFile || !effectiveFrom || running}
          onClick={() => run(false)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {running ? "Working…" : "Convert"}
        </button>
        {report?.output !== undefined && (
          <>
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100"
              onClick={() =>
                download(
                  convertedName(sourceFile!.name, to),
                  report.output ?? "",
                )
              }
            >
              Export .mct
            </button>
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100"
              onClick={() =>
                download(
                  convertedName(sourceFile!.name, to) + ".report.md",
                  reportMarkdown(report, sourceFile!.name),
                )
              }
            >
              Export report (.md)
            </button>
            <button
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100"
              onClick={() =>
                download(
                  convertedName(sourceFile!.name, to) + ".audit.json",
                  JSON.stringify({ ...report, output: undefined }, null, 2),
                  "application/json",
                )
              }
            >
              Export audit (.json)
            </button>
            <button
              className="rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm text-blue-800 hover:bg-blue-100"
              onClick={() =>
                props.onAdoptOutput(convertedName(sourceFile!.name, to), report.output ?? "")
              }
            >
              Load output as file B & compare
            </button>
          </>
        )}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      {report && (
        <div className="space-y-3">
          <div className="grid gap-2 text-center text-xs sm:grid-cols-5">
            <div className={`rounded px-2 py-2 font-semibold ${report.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              {report.ok ? "VERDICT: OK" : "VERDICT: BLOCKED"}
            </div>
            <div className="rounded bg-white px-2 py-2 ring-1 ring-slate-200">
              {report.recordsChanged.toLocaleString()} / {report.recordsExamined.toLocaleString()} records changed
            </div>
            <div className="rounded bg-white px-2 py-2 ring-1 ring-slate-200">
              {report.applied.length.toLocaleString()} audit entries ({commentEdits} comment)
            </div>
            <div className="rounded bg-white px-2 py-2 ring-1 ring-slate-200">
              {report.skippedProvisional.length} provisional rule(s) skipped
            </div>
            <div className="rounded bg-white px-2 py-2 ring-1 ring-slate-200">
              detected source: {report.detectedSourceVersion}
            </div>
          </div>

          {report.skippedProvisional.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
              <div className="mb-1 font-semibold text-amber-900">
                Skipped provisional rules (need explicit review)
              </div>
              {report.skippedProvisional.map((s, i) => (
                <div key={i} className="text-amber-900">
                  <span className="font-mono font-semibold">{s.ruleId}</span> ({s.section}):{" "}
                  {s.message}
                </div>
              ))}
            </div>
          )}

          {report.diagnostics.filter((d) => d.severity !== "info").length > 0 && (
            <div className="rounded-lg border border-slate-300 bg-white p-3 text-xs">
              <div className="mb-1 font-semibold">Diagnostics</div>
              {report.diagnostics
                .filter((d) => d.severity !== "info")
                .map((d, i) => (
                  <div key={i} className="flex gap-2 py-0.5">
                    <span className={`h-fit rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[d.severity]}`}>
                      {d.severity}
                    </span>
                    <span className="font-mono text-slate-500">{d.code}</span>
                    <span>
                      {d.message}
                      {d.line !== undefined ? ` (line ${d.line})` : ""}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <div className="rounded-lg border border-slate-300 bg-white p-3 text-xs">
            <div className="mb-1 font-semibold">Applied rules</div>
            {byRule.map(([id, count]) => {
              const info = ruleInfo(id);
              return (
                <div key={id} className="border-t border-slate-100 py-1">
                  <span className="font-mono font-semibold">{id}</span> × {count.toLocaleString()}
                  {info && (
                    <span className="ml-2 text-slate-500">
                      [{info.command}] {info.confidence}
                      {info.requiresReview ? ", needs review" : ""} — {info.description}
                    </span>
                  )}
                  {id === "MCT-CVT-100" && (
                    <span className="ml-2 text-slate-500">
                      cosmetic comment-template refresh
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg border border-slate-300 bg-white p-3 text-xs">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold">Audit trail (data records)</span>
              {(["info", "warning", "error", "loss"] as Severity[]).map((s) => (
                <label key={s} className="flex items-center gap-1 text-slate-600">
                  <input
                    type="checkbox"
                    checked={severityFilter.has(s)}
                    onChange={() => toggleSeverity(s)}
                  />
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLE[s]}`}>
                    {s}
                  </span>
                </label>
              ))}
              <span className="text-slate-400">
                showing {Math.min(100, auditShown.length).toLocaleString()} of{" "}
                {auditShown.length.toLocaleString()}
              </span>
            </div>
            <div className="diff-scroll max-h-[40vh] overflow-auto font-mono text-[11px]">
              {auditShown.slice(0, 100).map((a, i) => (
                <div key={i} className="border-t border-slate-100 py-1">
                  <div className="text-slate-600">
                    {a.ruleId} · *{a.section} · lines {a.startLine}-{a.endLine}
                  </div>
                  {a.before.map((b, j) => (
                    <div key={`b${j}`} className="truncate bg-red-50 px-1">
                      − {b.trim()}
                    </div>
                  ))}
                  {a.after.map((c, j) => (
                    <div key={`c${j}`} className="truncate bg-green-50 px-1">
                      + {c.trim()}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function convertedName(sourceName: string, to: CivilVersion): string {
  const base = sourceName.replace(/\.mct$/i, "");
  return `${base}.civil${to}.mct`;
}

/** Minimal client-side markdown (the worker report renderer stays in the engine). */
function reportMarkdown(report: ConversionReport, sourceName: string): string {
  const lines: string[] = [];
  lines.push(`# MCT Conversion Report`);
  lines.push(``);
  lines.push(`- Source file: \`${sourceName}\``);
  lines.push(`- Direction: CIVIL ${report.from} → CIVIL ${report.to}`);
  lines.push(`- Detected source version: ${report.detectedSourceVersion}`);
  lines.push(`- Records examined: ${report.recordsExamined}`);
  lines.push(`- Records changed: ${report.recordsChanged}`);
  lines.push(`- Verdict: ${report.ok ? "OK" : "BLOCKED"}`);
  lines.push(``);
  for (const d of report.diagnostics.filter((d) => d.severity !== "info")) {
    lines.push(`- [${d.severity}] ${d.code}: ${d.message}`);
  }
  lines.push(``);
  lines.push(`## Applied rules`);
  const byRule = new Map<string, number>();
  for (const a of report.applied) byRule.set(a.ruleId, (byRule.get(a.ruleId) ?? 0) + 1);
  for (const [id, count] of [...byRule].sort()) lines.push(`- ${id} × ${count}`);
  lines.push(``);
  return lines.join("\n");
}
