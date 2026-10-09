import type { CivilVersion } from "@mct/shared-types";
import { engineApi, useEngine, type Inventory } from "../engine";
import FileDropZone, { type PickedFile } from "./FileDropZone";

export type VersionChoice = CivilVersion | "auto";

export default function WorkspaceTab(props: {
  fileA: PickedFile | null;
  fileB: PickedFile | null;
  versionA: VersionChoice;
  versionB: VersionChoice;
  onPickA: (f: PickedFile) => void;
  onPickB: (f: PickedFile) => void;
  onClearA: () => void;
  onClearB: () => void;
  onVersionA: (v: VersionChoice) => void;
  onVersionB: (v: VersionChoice) => void;
  onCompare: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <FileCard
          label="Reference file (A)"
          accent="blue"
          file={props.fileA}
          version={props.versionA}
          onPick={props.onPickA}
          onClear={props.onClearA}
          onVersion={props.onVersionA}
        />
        <FileCard
          label="Modified / target file (B)"
          accent="amber"
          file={props.fileB}
          version={props.versionB}
          onPick={props.onPickB}
          onClear={props.onClearB}
          onVersion={props.onVersionB}
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          disabled={!props.fileA || !props.fileB}
          onClick={props.onCompare}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Compare A ↔ B
        </button>
        {(!props.fileA || !props.fileB) && (
          <span className="text-sm text-slate-500">
            Load both files to enable comparison, conversion and validation.
          </span>
        )}
      </div>
    </div>
  );
}

function FileCard(props: {
  label: string;
  accent: "blue" | "amber";
  file: PickedFile | null;
  version: VersionChoice;
  onPick: (f: PickedFile) => void;
  onClear: () => void;
  onVersion: (v: VersionChoice) => void;
}) {
  const inv = useEngine<Inventory>(
    props.file ? `${props.label}:${props.file.name}:${props.file.text.length}` : null,
    () => engineApi.inventory(props.file!.name, props.file!.text),
  );

  const detected = inv.data?.detected ?? "…";
  const effective =
    props.version === "auto" ? detected : props.version;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <FileDropZone
        label={props.label}
        accent={props.accent}
        file={props.file}
        onPick={props.onPick}
        onClear={props.onClear}
      />
      {props.file && (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">
              Assigned version:
            </label>
            <select
              value={props.version}
              onChange={(e) => props.onVersion(e.target.value as VersionChoice)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
            >
              <option value="auto">Auto-detect</option>
              <option value="2022">CIVIL 2022</option>
              <option value="2025">CIVIL 2025</option>
            </select>
            <span className="text-xs text-slate-500">
              detected: <span className="font-semibold">{detected}</span>
              {inv.data?.versionString ? ` (${inv.data.versionString})` : ""}
              {props.version !== "auto" && ` · using ${effective}`}
            </span>
          </div>
          {inv.loading && (
            <div className="text-xs text-slate-500">Analysing…</div>
          )}
          {inv.error && (
            <div className="text-xs text-red-600">{inv.error}</div>
          )}
          {inv.data && (
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <Stat label="Lines" value={inv.data.lines.toLocaleString()} />
              <Stat label="Records" value={inv.data.records.toLocaleString()} />
              <Stat label="Sections" value={String(inv.data.sections.length)} />
            </dl>
          )}
          {inv.data && inv.data.sections.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-600">
                Section inventory ({inv.data.sections.length})
              </summary>
              <div className="mt-1 max-h-48 overflow-auto rounded border border-slate-200 bg-white">
                <table className="w-full font-mono text-[11px]">
                  <tbody>
                    {inv.data.sections.map((s, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-0.5">{s.name}</td>
                        <td className="px-2 py-0.5 text-right text-slate-500">
                          {s.records}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded bg-white px-2 py-1.5 text-center ring-1 ring-slate-200">
      <div className="font-mono font-semibold text-slate-800">{props.value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">
        {props.label}
      </div>
    </div>
  );
}
