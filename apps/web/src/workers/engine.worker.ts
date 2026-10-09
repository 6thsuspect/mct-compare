/**
 * Engine Web Worker: heavy parsing, diffing, conversion and validation run
 * off the UI thread. The engine packages are pure TypeScript with no DOM or
 * Node dependencies, so they load unmodified inside the worker.
 */
import {
  buildModel,
  diffDocuments,
  diffModels,
} from "@mct/diff";
import {
  convertDocument,
  detectVersion,
  listAllRules,
} from "@mct/converter";
import { countRecords, parseMct } from "@mct/parser";
import { validateText } from "@mct/validation";

interface EngineRequest {
  id: number;
  kind:
    | "inventory"
    | "textDiff"
    | "semanticDiff"
    | "convert"
    | "validate"
    | "rules";
  payload: Record<string, unknown>;
}

const handlers: Record<EngineRequest["kind"], (p: Record<string, unknown>) => unknown> = {
  inventory: (p) => {
    const text = p.text as string;
    const name = (p.name as string) ?? "file.mct";
    const doc = parseMct(name, text);
    const detected = detectVersion(doc);
    return {
      lines: doc.lines.length,
      bytes: text.length,
      eol: doc.eol,
      records: countRecords(doc),
      sections: doc.sections.map((s) => ({
        name: s.header.name,
        args: s.header.args,
        records: s.records.length,
        startLine: s.startLine,
        endLine: s.endLine,
      })),
      diagnostics: doc.diagnostics,
      detected: detected.version,
      evidence: detected.evidence,
      versionString: detected.versionString ?? null,
    };
  },
  textDiff: (p) => {
    const docA = parseMct("a", p.textA as string);
    const docB = parseMct("b", p.textB as string);
    return diffDocuments(docA, docB, {
      ignoreWhitespace: p.ignoreWhitespace as boolean,
    });
  },
  semanticDiff: (p) => {
    const a = buildModel(parseMct("a", p.textA as string));
    const b = buildModel(parseMct("b", p.textB as string));
    return diffModels(a, b);
  },
  convert: (p) => {
    const doc = parseMct((p.name as string) ?? "source.mct", p.text as string);
    return convertDocument(doc, {
      from: p.from as "2022" | "2025",
      to: p.to as "2022" | "2025",
      includeProvisional: p.includeProvisional as boolean,
      refreshComments: p.refreshComments as boolean,
      dryRun: p.dryRun as boolean,
    });
  },
  validate: (p) => {
    return validateText((p.name as string) ?? "file.mct", p.text as string, {
      targetVersion: (p.target as "2022" | "2025" | undefined) ?? undefined,
    });
  },
  rules: () => {
    return listAllRules().map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      command: r.command,
      description: r.description,
      confidence: r.confidence,
      requiresReview: r.requiresReview,
    }));
  },
};

self.onmessage = (e: MessageEvent<EngineRequest>) => {
  const { id, kind, payload } = e.data;
  try {
    const result = handlers[kind](payload);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
