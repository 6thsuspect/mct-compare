# Reference Difference Report — CIVIL 2022 vs 2025

Evidence analysis of the provenance-locked fixture pair
(`fixtures/reference-2022.mct`, `fixtures/reference-2025.mct`; SHA-256 pinned
in `scripts/verify-fixtures.mjs`). Both files describe the same steel-bridge
model (1,973 nodes, 2,238 beam/truss elements).

## Geometry

| | 2022 | 2025 | Δ |
| --- | --- | --- | --- |
| Content lines | 7,797 | 7,810 | +13 |
| Sections | 35 | 35 | 0 |
| Data records | 6,827 | 6,827 | 0 |
| `*VERSION` | 9.1.0 | 9.6.0 | — |

Line growth (+13) is comment-only: `*SECTION` +2, `*DGN-SECT` +2, `*DGN-STEEL`
+9. Record counts are identical — the 2025 file adds no model data.

## Semantic summary

`equivalent 5,218 · modified 1,611 · added 0 · removed 0 · unclassified 0`

Modified records by section: `*BEAMLOAD` 1,363 · `*SECTION` 121 · `*DGN-SECT`
121 · `*DGN-MATL` 3 · `*LOADCOMB` 2 · `*VERSION` 1.

## Data differences (each is a conversion rule)

### 1. `*VERSION` 9.1.0 → 9.6.0 — MCT-CVT-001 (verified)

Single-line change. The version token is the primary detection signal.

### 2. TAPERED sections gain `bHUMBLY` — MCT-CVT-002A/002B (verified)

121 TAPERED sections in `*SECTION` (rule 002A) and the same 121 mirrored in
`*DGN-SECT` (rule 002B); each mirrored pair shares the section number. The
header record grows from 18 to 19 comma-separated fields: `bHUMBLY=NO` is
inserted before `SHAPE` (field index 14). The continuation payload lines are
byte-identical in all 242 pairs — headers only. Verified: every 2022 TAPERED
header has 18 fields, every 2025 one has 19 with `NO` at index 14. See
`rules/mct-cvt-002-tapered.md`.

### 3. `*BEAMLOAD` ECCDIR respelling — MCT-CVT-003 (provisional)

All 1,363 records: the field-6 token `aDir[1]` becomes `LY`. Positionally
perfect across the whole section, but the token's engineering meaning is
undocumented in any source available to this project, so the rule ships
**provisional**: it only applies with explicit opt-in and is otherwise
reported as skipped. See `rules/mct-cvt-003-beamload.md`.

### 4. `*LOADCOMB` gains a trailing field — MCT-CVT-004 (verified)

Both combinations gain a 10th comma-separated field on the header line
(`NAME=…` record): 9 → 10 fields. The two sub-records are untouched. See
`rules/mct-cvt-004-loadcomb.md`.

### 5. `*DGN-MATL` gains trailing fields — MCT-CVT-005 (provisional)

Three of four material-mapping records change (one is byte-identical between
versions and is correctly left untouched). The 2025 lines carry additional
trailing comma-separated fields. Provisional: only three instances exist and
the new fields' meaning is undocumented. See `rules/mct-cvt-005-dgn-matl.md`.

### 6. Explicitly rejected: no other data rule

Every other section (NODE, ELEMENT, MATERIAL, GROUP, CONSTRAINT, SPRING,
ELASTICLINK, FRAME-RLS, STLDCASE, SELFWEIGHT, LC-COLOR, LENGTH, LIMITSRATIO,
SECTION MANAGER-*, …) is byte-identical between the references. No rule is
invented for unchanged data. A hypothetical sixth rule was considered and
**rejected** during analysis — see `rules/mct-cvt-006-rejected.md` for the
recorded rationale.

## Comment-template differences — MCT-CVT-100 (cosmetic, opt-in)

The `;`-prefixed schema documentation embedded in the files was revised
between generations: new code-system rows (KDS, AISC15, NSCP, JRoad),
a `[Dumbbell]` row in the SECTION families, removed legacy rows (SRC_OLD,
AISC13, EC3) and reworded anchors. These lines never affect the model; the
refresh pass reproduces them exactly (29 verified templates) but is purely
opt-in and idempotent. See `rules/mct-cvt-100-comments.md`.

## Reverse direction (2025 → 2022)

All six rules are bidirectional: forward inserts are reversed as removals,
`LY` → `aDir[1]`, `9.6.0` → `9.1.0`. Reverse conversion of the 2025
reference reproduces the 2022 reference byte-identically. Reverse comment
refresh removes the 2025-only templates and restores the 2022-only ones.

## What this report does not claim

- The fixtures exercise one model; other models may contain commands never
  seen here. Unknown commands pass through conversion untouched (invariant).
- Provisional rules are evidence-backed but undocumented — they require a
  qualified engineer's review before professional use.
- Byte-identity against the 2025 reference proves format fidelity, not
  engineering validity: converted models must still pass validation levels 3
  and 4 (see `docs/validation.md`).
