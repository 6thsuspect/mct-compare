import { useEffect, useRef, useState } from "react";
import type {
  ConversionReport,
  Diagnostic,
  SemanticChange,
  SemanticDiffSummary,
  TextDiffResult,
  ValidationReport,
} from "@mct/shared-types";

export interface InventorySection {
  name: string;
  args: string[];
  records: number;
  startLine: number;
  endLine: number;
}

export interface Inventory {
  lines: number;
  bytes: number;
  eol: string;
  records: number;
  sections: InventorySection[];
  diagnostics: Diagnostic[];
  detected: string;
  evidence: string[];
  versionString: string | null;
}

export interface RuleInfo {
  id: string;
  from: string;
  to: string;
  command: string;
  description: string;
  confidence: string;
  requiresReview: boolean;
}

export interface SemanticDiffData {
  changes: SemanticChange[];
  summary: SemanticDiffSummary;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("./workers/engine.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data as {
        id: number;
        ok: boolean;
        result: unknown;
        error: string;
      };
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (ok) entry.resolve(result);
      else entry.reject(new Error(error));
    };
  }
  return worker;
}

export function callEngine<T>(kind: string, payload: Record<string, unknown>): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (v) => resolve(v as T),
      reject,
    });
    getWorker().postMessage({ id, kind, payload });
  });
}

export const engineApi = {
  inventory: (name: string, text: string) =>
    callEngine<Inventory>("inventory", { name, text }),
  textDiff: (textA: string, textB: string, ignoreWhitespace: boolean) =>
    callEngine<TextDiffResult>("textDiff", { textA, textB, ignoreWhitespace }),
  semanticDiff: (textA: string, textB: string) =>
    callEngine<SemanticDiffData>("semanticDiff", { textA, textB }),
  convert: (opts: {
    name: string;
    text: string;
    from: "2022" | "2025";
    to: "2022" | "2025";
    includeProvisional: boolean;
    refreshComments: boolean;
    dryRun: boolean;
  }) => callEngine<ConversionReport>("convert", { ...opts }),
  validate: (name: string, text: string, target?: "2022" | "2025") =>
    callEngine<ValidationReport>("validate", { name, text, target }),
  rules: () => callEngine<RuleInfo[]>("rules", {}),
};

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Runs an engine call once per key change; guards against stale results. */
export function useEngine<T>(
  key: string | null,
  invoke: () => Promise<T>,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: key !== null,
    error: null,
  });
  const runId = useRef(0);
  useEffect(() => {
    if (key === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const id = ++runId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    invoke().then(
      (data) => {
        if (runId.current === id) setState({ data, loading: false, error: null });
      },
      (err: unknown) => {
        if (runId.current === id) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function download(filename: string, content: string, mime = "text/plain"): void {
  // Inside the Electron shell, route through the native save dialog.
  if (typeof window !== "undefined" && window.mctDesktop) {
    window.mctDesktop.saveFile(filename, content).catch(() => {
      fallbackDownload(filename, content, mime);
    });
    return;
  }
  fallbackDownload(filename, content, mime);
}

function fallbackDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
