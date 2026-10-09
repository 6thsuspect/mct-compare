# MCT Diff Studio — MIDAS CIVIL 2022 ↔ 2025

GitHub-style text diff, engineering semantic diff, and an audited
bidirectional `.mct` converter between the MIDAS CIVIL 2022 and 2025
generations — with validation, audit reports, and one shared engine across
web, Windows desktop, and CLI.

## What it does

- **Text diff** — side-by-side Myers diff with hunk navigation, section
  filter, search, whitespace-insensitive mode, and unified-diff export.
- **Semantic diff** — section-aware record comparison (1,611 evidenced changes
  on the reference pair: TAPERED `bHUMBLY`, BEAMLOAD, LOADCOMB, DGN-MATL…)
  with field-level before/after inspection and two-way links into the text diff.
- **Bidirectional converter** — explicit, versioned rules (`MCT-CVT-001…005`,
  cosmetic `100`) convert 2022 ↔ 2025. Forward conversion reproduces the 2025
  reference **byte-identically**, and vice versa. Provisional rules need
  opt-in; unconvertible records block instead of guessing; every change lands
  in a per-record audit trail.
- **Validation** — file + model integrity checks (references, duplicates,
  required sections) plus target-compatibility probes, with markdown reports.

## Quickstart

Prerequisites: Node.js ≥ 20.

```bash
npm install
npm test            # 64 tests: unit + integration + regression
npm run verify:fixtures
```

| Shell | Command |
| --- | --- |
| Web app | `npm --workspace @mct/web run dev` → http://localhost:5173 |
| CLI | `npm run build && node apps/cli/dist/cli.js --help` |
| Desktop (Windows) | see `apps/desktop/README.md` |

CLI examples:

```bash
node apps/cli/dist/cli.js diff fixtures/reference-2022.mct fixtures/reference-2025.mct
node apps/cli/dist/cli.js convert --from 2022 --to 2025 --include-provisional --refresh-comments --audit audit.json --report report.md in.mct out.mct
node apps/cli/dist/cli.js validate --target 2025 out.mct
node apps/cli/dist/cli.js rules
```

## Project layout

```
packages/shared-types  contracts (versions, diagnostics, diff/audit reports)
packages/mct-parser    lossless line-preserving parser
packages/mct-diff      text diff + semantic diff
packages/mct-converter version detection, rules, comment refresh, reports
packages/mct-validation  4-level validation framework (levels 1-2 automated)
apps/cli apps/web apps/desktop   shells (one engine, three faces)
fixtures/  provenance-locked 2022/2025 reference pair (SHA-256 pinned)
tests/     integration (byte-identity) + regression
rules/     one evidence file per conversion rule
docs/      architecture, difference report, inventory, validation, limitations
```

Start with `docs/architecture.md`, then `docs/reference-difference-report.md`.

## Safety contract

- Originals are never mutated; the converter writes new output only.
- Unknown commands pass through untouched — nothing is silently dropped.
- Provisional rules (`MCT-CVT-003`, `MCT-CVT-005`) require explicit opt-in and
  engineering review.
- Validation levels 3 (acceptance in the target CIVIL release) and 4
  (engineering verification) are manual gates and are never simulated.

Converted models must be re-validated inside MIDAS CIVIL and reviewed by a
qualified engineer before professional use.
