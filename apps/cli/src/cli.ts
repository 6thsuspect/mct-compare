#!/usr/bin/env node
/**
 * mct — command-line interface for the MCT version tool.
 *
 * Commands:
 *   mct inventory <file>            section/record inventory + hashes
 *   mct roundtrip <file>             parse/serialize byte-identity check
 *   mct diff <a> <b>                 text + semantic comparison
 *   mct convert <file> --from --to   bidirectional version conversion
 *   mct validate <file>              syntax + model + compatibility checks
 *   mct rules                       list conversion rules
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildModel,
  diffDocuments,
  diffModels,
  semanticAtLine,
  toUnifiedDiff,
} from "@mct/diff";
import {
  adapterFor,
  convertDocument,
  detectVersion,
  listAllRules,
  renderMarkdownReport,
} from "@mct/converter";
import { countRecords, getSections, parseMct, serializeMct } from "@mct/parser";
import type { CivilVersion } from "@mct/shared-types";
import {
  renderMarkdownValidationReport,
  validateText,
} from "@mct/validation";

const VERSION = "0.1.0";

export async function run(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "inventory":
        return cmdInventory(rest);
      case "roundtrip":
        return cmdRoundtrip(rest);
      case "diff":
        return cmdDiff(rest);
      case "convert":
        return cmdConvert(rest);
      case "validate":
        return cmdValidate(rest);
      case "rules":
        return cmdRules(rest);
      case "--version":
      case "-V":
        print(`mct ${VERSION}`);
        return 0;
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        return command === undefined ? 1 : 0;
      default:
        printError(`Unknown command "${command}". Run "mct --help".`);
        return 1;
    }
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

// ---------------------------------------------------------------------------
// inventory
// ---------------------------------------------------------------------------

function cmdInventory(args: string[]): number {
  const [file] = positional(args);
  requireFile(file, "mct inventory <file>");
  const text = readFileSync(file, "utf8");
  const doc = parseMct(file, text);
  const sha = createHash("sha256").update(text, "utf8").digest("hex");
  print(`file:      ${file}`);
  print(`bytes:     ${text.length}  sha256:${sha}`);
  print(`lines:     ${doc.lines.length}  eol:${doc.eol}`);
  print(`sections:  ${doc.sections.length}  records:${countRecords(doc)}`);
  print(`detected:  ${detectVersion(doc).version}`);
  print(``);
  print(`sections:`);
  for (const s of doc.sections) {
    const args = s.header.args.length > 0 ? ` [${s.header.args.join(", ")}]` : "";
    print(
      `  ${s.header.name}${args}  records:${s.records.length}  lines:${s.startLine}-${s.endLine}`,
    );
  }
  if (doc.diagnostics.length > 0) {
    print(``);
    print(`parse diagnostics:`);
    for (const d of doc.diagnostics) {
      print(`  [${d.severity}] ${d.code}: ${d.message}`);
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// roundtrip
// ---------------------------------------------------------------------------

function cmdRoundtrip(args: string[]): number {
  const [file] = positional(args);
  requireFile(file, "mct roundtrip <file>");
  const text = readFileSync(file, "utf8");
  const doc = parseMct(file, text);
  if (serializeMct(doc) === text) {
    print(`OK  ${file}: parse/serialize round-trip is byte-identical (${text.length} bytes).`);
    return 0;
  }
  printError(`FAIL  ${file}: round-trip differs.`);
  return 2;
}

// ---------------------------------------------------------------------------
// diff
// ---------------------------------------------------------------------------

function cmdDiff(args: string[]): number {
  const opts = parseFlags(args, {
    json: false,
    unified: false,
    "ignore-whitespace": false,
    "text-only": false,
    "semantic-only": false,
    context: "3",
  });
  const [fileA, fileB] = positional(args);
  if (!fileA || !fileB) {
    throw new Error("Usage: mct diff <file-a> <file-b> [options]");
  }
  requireFile(fileA, "mct diff <file-a> <file-b>");
  requireFile(fileB, "mct diff <file-a> <file-b>");
  const textA = readFileSync(fileA, "utf8");
  const textB = readFileSync(fileB, "utf8");
  const docA = parseMct(fileA, textA);
  const docB = parseMct(fileB, textB);

  if (opts.json) {
    const text = opts["semantic-only"]
      ? null
      : diffDocuments(docA, docB, {
          ignoreWhitespace: opts["ignore-whitespace"],
        });
    const semantic = opts["text-only"]
      ? null
      : diffModels(buildModel(docA), buildModel(docB));
    print(JSON.stringify({ fileA, fileB, text, semantic }, null, 2));
    return 0;
  }

  if (!opts["semantic-only"]) {
    const text = diffDocuments(docA, docB, {
      ignoreWhitespace: opts["ignore-whitespace"],
    });
    print(`text diff: ${text.hunks.length} hunk(s), +${text.added + text.modifiedAfter} / -${text.deleted + text.modifiedBefore} lines`);
    if (opts.unified) {
      print(
        toUnifiedDiff(
          fileA,
          fileB,
          textA.split("\n"),
          textB.split("\n"),
          text.hunks,
          Number(opts.context),
        ),
      );
    } else {
      for (const h of text.hunks.slice(0, 40)) {
        print(
          `  ${h.op} a:${h.aStart + 1}-${h.aEnd} b:${h.bStart + 1}-${h.bEnd} [${h.aSection ?? "?"}]`,
        );
      }
      if (text.hunks.length > 40) {
        print(`  … and ${text.hunks.length - 40} further hunks (use --unified for full output)`);
      }
    }
  }

  if (!opts["text-only"]) {
    const semantic = diffModels(buildModel(docA), buildModel(docB));
    const s = semantic.summary;
    print(
      `semantic diff: ${s.modified} modified, ${s.added} added, ${s.removed} removed, ${s.unclassified} unclassified, ${s.equivalent} equivalent`,
    );
    for (const c of semantic.changes.slice(0, 60)) {
      const where = c.aLines?.[0] ?? c.bLines?.[0] ?? "?";
      print(`  [${c.status}] ${c.label} (${c.section} line ${where})`);
      for (const f of (c.fields ?? []).slice(0, 6)) {
        print(`      ${f.field}: ${JSON.stringify(f.before)} -> ${JSON.stringify(f.after)}`);
      }
    }
    if (semantic.changes.length > 60) {
      print(`  … and ${semantic.changes.length - 60} further changes (use --json for full output)`);
    }
    void semanticAtLine;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// convert
// ---------------------------------------------------------------------------

function cmdConvert(args: string[]): number {
  const opts = parseFlags(args, {
    from: "",
    to: "",
    out: "",
    report: "",
    audit: "",
    "include-provisional": false,
    "refresh-comments": false,
    "dry-run": false,
    json: false,
  });
  const [file] = positional(args);
  if (!file || !opts.from || !opts.to) {
    throw new Error(
      "Usage: mct convert <file> --from <2022|2025> --to <2022|2025> --out <file> [options]",
    );
  }
  requireFile(file, "mct convert <file> ...");
  assertVersion(opts.from);
  assertVersion(opts.to);
  const text = readFileSync(file, "utf8");
  const doc = parseMct(file, text);
  const report = convertDocument(doc, {
    from: opts.from,
    to: opts.to,
    includeProvisional: opts["include-provisional"],
    refreshComments: opts["refresh-comments"],
    dryRun: opts["dry-run"] || !opts.out,
  });

  if (opts.json) {
    print(JSON.stringify({ ...report, output: undefined }, null, 2));
  } else {
    print(
      `convert: ${adapterFor(report.from).label} -> ${adapterFor(report.to).label}`,
    );
    print(`records: ${report.recordsChanged}/${report.recordsExamined} changed`);
    print(`audit entries: ${report.applied.length}`);
    for (const s of report.skippedProvisional) {
      print(`skipped: ${s.message}`);
    }
    for (const d of report.diagnostics.filter((d) => d.severity !== "info")) {
      print(`[${d.severity}] ${d.code}${d.line ? ` line ${d.line}` : ""}: ${d.message}`);
    }
    print(`verdict: ${report.ok ? "OK" : "BLOCKED"}`);
  }

  if (report.output !== undefined && opts.out) {
    ensureDir(opts.out);
    writeFileSync(opts.out, report.output, "utf8");
    print(`wrote ${opts.out} (${report.output.length} bytes)`);
  }
  if (opts.report) {
    ensureDir(opts.report);
    writeFileSync(opts.report, renderMarkdownReport(report, file), "utf8");
    print(`wrote ${opts.report}`);
  }
  if (opts.audit) {
    ensureDir(opts.audit);
    writeFileSync(
      opts.audit,
      JSON.stringify({ ...report, output: undefined }, null, 2),
      "utf8",
    );
    print(`wrote ${opts.audit}`);
  }
  return report.ok ? 0 : 2;
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

function cmdValidate(args: string[]): number {
  const opts = parseFlags(args, {
    target: "",
    json: false,
    report: "",
  });
  const [file] = positional(args);
  requireFile(file, "mct validate <file>");
  const target = opts.target ? toVersion(opts.target) : undefined;
  const text = readFileSync(file, "utf8");
  const report = validateText(file, text, target ? { targetVersion: target } : {});
  if (opts.json) {
    print(JSON.stringify(report, null, 2));
  } else {
    print(`file: ${report.file} (${report.stats.bytes} bytes, ${report.stats.lines} lines)`);
    print(`detected: ${report.detectedVersion}${report.targetVersion ? `  target: ${report.targetVersion}` : ""}`);
    print(`level 1 file integrity: ${report.fileOk ? "PASS" : "FAIL"}`);
    print(
      `level 2 model integrity: ${report.counts.error + report.counts.loss} error(s), ` +
        `${report.counts.warning} warning(s), ${report.counts.info} info`,
    );
    for (const d of report.diagnostics.filter((d) => d.severity !== "info").slice(0, 80)) {
      const where = [
        d.section ? `*${d.section}` : "",
        d.line !== undefined ? `line ${d.line}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      print(`[${d.severity}] ${d.code}${where ? ` (${where})` : ""}: ${d.message}`);
    }
  }
  if (opts.report) {
    ensureDir(opts.report);
    writeFileSync(opts.report, renderMarkdownValidationReport(report), "utf8");
    print(`wrote ${opts.report}`);
  }
  return report.counts.error + report.counts.loss > 0 || !report.fileOk ? 2 : 0;
}

// ---------------------------------------------------------------------------
// rules
// ---------------------------------------------------------------------------

function cmdRules(args: string[]): number {
  const opts = parseFlags(args, { json: false });
  const rules = listAllRules();
  if (opts.json) {
    print(
      JSON.stringify(
        rules.map((r) => ({
          id: r.id,
          from: r.from,
          to: r.to,
          command: r.command,
          description: r.description,
          confidence: r.confidence,
          requiresReview: r.requiresReview,
        })),
        null,
        2,
      ),
    );
    return 0;
  }
  for (const r of rules) {
    print(
      `${r.id}  ${r.from}->${r.to}  [${r.command}]  ${r.confidence}${r.requiresReview ? " (needs review)" : ""}`,
    );
    print(`    ${r.description}`);
  }
  print(`MCT-CVT-100  comment-template refresh (cosmetic, opt-in via --refresh-comments)`);
  return 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parseFlags<T extends Record<string, string | boolean>>(
  args: string[],
  defaults: T,
): T {
  const out: Record<string, string | boolean> = { ...defaults };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    if (!(key in defaults)) throw new Error(`Unknown option --${key}.`);
    if (typeof defaults[key] === "boolean") {
      out[key] = eq >= 0 ? arg.slice(eq + 1) === "true" : true;
    } else {
      const value = eq >= 0 ? arg.slice(eq + 1) : args[++i];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Option --${key} needs a value.`);
      }
      out[key] = value;
    }
  }
  return out as T;
}

/** Flags that consume a following value (mirrors parseFlags defaults). */
const VALUE_FLAGS = new Set([
  "from",
  "to",
  "out",
  "report",
  "audit",
  "context",
  "target",
]);

function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
      if (eq < 0 && VALUE_FLAGS.has(key)) i += 1; // skip consumed value
      continue;
    }
    out.push(arg);
  }
  return out;
}

function requireFile(file: string | undefined, usage: string): asserts file is string {
  if (!file) throw new Error(`Usage: ${usage}`);
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);
}

function assertVersion(value: string): asserts value is CivilVersion {
  if (value !== "2022" && value !== "2025") {
    throw new Error(`Version must be 2022 or 2025, got "${value}".`);
  }
}

function toVersion(value: string): CivilVersion {
  assertVersion(value);
  return value;
}

function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

function print(message: string): void {
  process.stdout.write(message + "\n");
}

function printError(message: string): void {
  process.stderr.write(`mct: ${message}\n`);
}

function printHelp(): void {
  print(`mct ${VERSION} — MIDAS CIVIL MCT comparator & bidirectional converter

Usage:
  mct inventory <file>                          section/record inventory + hashes
  mct roundtrip <file>                          parse/serialize byte-identity check
  mct diff <a> <b> [--unified] [--json]         text + semantic comparison
                   [--ignore-whitespace] [--text-only] [--semantic-only]
  mct convert <file> --from 2022 --to 2025 --out <file>
                   [--include-provisional] [--refresh-comments] [--dry-run]
                   [--report <md>] [--audit <json>] [--json]
  mct validate <file> [--target 2022|2025] [--json] [--report <md>]
  mct rules [--json]                            list conversion rules

Exit codes: 0 ok · 1 usage/runtime error · 2 findings/blocked.
Original files are never modified; conversion writes only to --out.`);
}

const invokedDirectly =
  typeof require !== "undefined" && require.main === module;
if (invokedDirectly) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      printError(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    },
  );
}
