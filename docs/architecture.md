# Architecture

MCT Diff Studio compares and converts MIDAS CIVIL `.mct` text models between
the 2022 and 2025 generations. One engine (pure TypeScript, zero runtime
dependencies) powers three shells: a web app, an Electron Windows app, and a
CLI.

## Package map

```
packages/
  shared-types/   Version, Diagnostic, diff + conversion + audit contracts
  mct-parser/     Lossless line-preserving parser (positions, comments, EOL)
  mct-diff/       Text diff (Myers) + section-aware semantic diff
  mct-converter/  Version detection, explicit conversion rules (MCT-CVT-*),
                  comment-template refresh, audit + report rendering
  mct-validation/ 4-level validation framework (levels 1-2 automated)
apps/
  cli/            inventory | roundtrip | diff | convert | validate | rules
  web/            React + Tailwind UI; engine runs in a Web Worker
  desktop/        Electron shell reusing the web build verbatim
fixtures/         Provenance-locked reference pair + small cases
tests/            Integration + regression suites (byte-identity assertions)
rules/            One evidence file per conversion rule
```

Dependency direction is strict: `shared-types ← parser ← {diff, converter,
validation} ← apps`. The engine never touches the DOM, Node APIs, or the
network, so the same code runs in Node (CLI, tests), a Web Worker (browser),
and the Electron renderer.

## Pipeline

```
.mct text ──► parseMct ──► MctDocument ──┬──► diffDocuments ──► hunks
                                           ├──► buildModel ──► diffModels
                                           ├──► convertDocument ──► output + audit
                                           └──► validateText ──► diagnostics
```

- **Parser** keeps every source line with its 1-based number, classifies blank /
  comment / section-header / data lines, and groups data lines into records per
  section. Unknown sections and unknown commands are preserved verbatim —
  nothing is ever silently dropped.
- **Text diff** is a line-based Myers diff with optional whitespace-insensitive
  comparison, hunk headers annotated with the owning `*SECTION`.
- **Semantic diff** builds keyed record models per section (node IDs, element
  IDs, load names, …) and reports `equivalent | modified | added | removed |
  unclassified` changes with field-level before/after values. Sections without
  a dedicated comparator fall back to whole-record text comparison and are
  reported as `unclassified` when they differ — never silently ignored.
- **Converter** applies explicit, versioned rules (`MCT-CVT-001…005`, cosmetic
  `MCT-CVT-100`). Each rule declares confidence (`verified` or `provisional`);
  provisional rules only run with an explicit opt-in and are otherwise reported
  as skipped. Any record a rule cannot handle fails **blocked** (severity
  `loss`) instead of being guessed. Comment-template refresh is a separate
  opt-in pass that is idempotent and section-scoped.
- **Validation** implements levels 1 (file integrity) and 2 (model integrity:
  required sections, cross-reference checks, duplicate IDs, empty sections)
  plus target-compatibility checks. Levels 3 (acceptance in the target CIVIL
  release) and 4 (engineering verification) are documented as manual gates and
  are never simulated.

## Key invariants

1. **Lossless round-trip**: parsing then serialising any supported file is
   byte-identical (both 7.8k-line references are asserted byte-identical).
2. **No silent drops**: unknown commands/sections pass through conversion
   untouched; unmatched cosmetic patches emit warnings, not guesses.
3. **Originals are never mutated**: conversion always produces new output text;
   the CLI refuses to overwrite the input path.
4. **Same engine everywhere**: web, desktop and CLI share the engine packages;
   desktop ships the web build unmodified.
5. **Evidence over claims**: every rule links to a `rules/*.md` file with
   fixture line numbers; every conversion emits a per-record audit entry.
