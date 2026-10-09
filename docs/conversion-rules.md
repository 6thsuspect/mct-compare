# Conversion Rules

Every version change is an explicit, bidirectional, audited rule. Provisional
rules require opt-in (`includeProvisional` / `--include-provisional`) and are
otherwise reported as skipped; nothing is ever applied silently.

| Rule | Direction | Command | Change | Confidence |
| --- | --- | --- | --- | --- |
| MCT-CVT-001 | 2022 ↔ 2025 | `*VERSION` | `9.1.0` ↔ `9.6.0` | verified |
| MCT-CVT-002A | 2022 ↔ 2025 | `*SECTION` TAPERED header | insert/remove `bHUMBLY=NO` (18 ↔ 19 fields) | verified |
| MCT-CVT-002B | 2022 ↔ 2025 | `*DGN-SECT` TAPERED header | insert/remove `bHUMBLY=NO` (18 ↔ 19 fields) | verified |
| MCT-CVT-003 | 2022 ↔ 2025 | `*BEAMLOAD` | `aDir[1]` ↔ `LY` | **provisional** |
| MCT-CVT-004 | 2022 ↔ 2025 | `*LOADCOMB` header | 9 ↔ 10 fields | verified |
| MCT-CVT-005 | 2022 ↔ 2025 | `*DGN-MATL` | trailing fields added/removed | **provisional** |
| MCT-CVT-006 | — | — | considered and **rejected** | — |
| MCT-CVT-100 | 2022 ↔ 2025 | `;` comments | template refresh (cosmetic) | verified (opt-in) |

Evidence files: `rules/mct-cvt-001.md` … `rules/mct-cvt-100.md`.

## Rule lifecycle

1. **Proposed** — a difference is found between the references and recorded in
   `rules/` with fixture line numbers.
2. **Verified** — the change is positional and unambiguous across all
   instances (001, 002, 004, 100).
3. **Provisional** — the change is positional but its engineering meaning is
   undocumented, or instances are too few to generalise (003, 005). Applies
   only with explicit opt-in; the audit entry keeps `requiresReview: true`.
4. **Rejected** — recorded with rationale, never implemented (006).

## Failure behaviour

- A record that matches a rule's section but not its expected shape blocks the
  conversion (`ok: false`, severity `loss`) with file/section/line evidence.
- Unknown commands and sections pass through untouched — the converter only
  rewrites what a rule explicitly matches.
- Comment refresh never touches data lines; unmatched template anchors produce
  warnings, never guesses.
