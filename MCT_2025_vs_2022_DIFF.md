# MIDAS Civil MCT format: 2025 (v9.6.0) vs 2022 (v9.1.0)

A field-by-field comparison of the two MCT exports in this repository.

| | file | `*VERSION` | bytes | lines | data lines | blocks |
|---|---|---|---|---|---|---|
| Civil 2022 | `2022` | `9.1.0` | 508,833 | 7,797 | 7,397 | 35 |
| Civil 2025 | `2025` | `9.6.0` | 504,307 | 7,810 | 7,397 | 35 |

Both files are exports of **the same model**. The block inventory is identical —
the same 35 `*KEYWORD` blocks, in the same order — and **every block has the same
number of data lines**. Nothing was added, removed or re-ordered structurally.

**28 of the 35 blocks are byte-for-byte identical.** All of the model itself is
untouched: `*NODE` (1,973), `*ELEMENT` (2,238), `*GROUP` (348), `*MATERIAL`,
`*SECT-COLOR`, `*STLDCASE`, `*CONSTRAINT`, `*SPRING`, `*ELASTICLINK` (681),
`*FRAME-RLS`, `*LOADTOMASS`, `*SELFWEIGHT`, `*LENGTH`, `*LIMITSRATIO`, the
Section Manager blocks, and so on.

Only **7 blocks** differ. Of those, **5 are real format changes** and 2 are
cosmetic/documentation.

---

## The changes, in order of importance

### 1. `*SECTION` and `*DGN-SECT` — new `bHUMBLY` field  ⚠ BREAKING

Civil 2025 inserts a **"dumbbell" flag (`bHUMBLY`)** into the first line of a
section record, immediately after `bWE` and **before `SHAPE`**.

```
2022:  iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE,           SHAPE, iyVAR, izVAR, STYPE
2025:  iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, bHUMBLY,  SHAPE, iyVAR, izVAR, STYPE
```

Real lines from the two files (section 2, `Nose`):

```
2022:     2, TAPERED   , Nose              , CT, 0, 0, 0, 0, 0, 0, 0, 0, YES, NO,     H  , 1, 1, USER
2025:     2, TAPERED   , Nose              , CT, 0, 0, 0, 0, 0, 0, 0, 0, YES, NO, NO, H  , 1, 1, USER
                                                                              ^^^ inserted
```

Because the field is inserted in the *middle* of the line, everything to its
right shifts by one column. A Civil 2022 reader would take `SHAPE` from the
`bHUMBLY` slot, `iyVAR` from the `SHAPE` slot, and so on — i.e. **it would
silently mis-read the section definition.** This is the single change that
actually matters.

Field counts, first line of a section record:

| section TYPE | 2022 | 2025 | `bHUMBLY` index (0-based) | affected in this model |
|---|---|---|---|---|
| `TAPERED` | 18 | 19 | 14 | **121 lines** |
| `COMPOSITE-B` | 13 | 14 | 12 | 0 |
| `COMPOSITE-I` | 13 | 14 | 12 | 0 |
| `COMPOSITE-TUB` | 13 | 14 | 12 | 0 |
| `COMPOSITE-CI/CT` | 13 | 14 | 12 | 0 |
| `DBUSER`, `VALUE`, `SRC`, `COMBINED`, `CONSTRUCT`, `PSC` | — | — | *none* | unchanged |

The index differs by type because `TAPERED` uses the 9-field `[OFFSET2]` block
while the `COMPOSITE-*` types use the 7-field `[OFFSET]` block.

The 2025 documentation comments confirm the change, and also add a
`[Dumbbell] : bInfusion` tail to the value form of `[SRC]`:

```diff
  ; iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, SHAPE, iyVAR, izVAR, STYPE   ; 1st line - TAPERED
+ ; iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, bHUMBLY. SHAPE, iyVAR, izVAR, STYPE ; 1st line - TAPERED(Steel Comp. Psc Comp.)
- ; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE                          ; 1st line - COMPOSITE-B
+ ; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, bHUMBLY, SHAPE                 ; 1st line - COMPOSITE-B
- ; [SRC] : 1, DB, NAME1, NAME2 or 2, D1, ..., D10, iN1, iN2
+ ; [SRC] : 1, DB, NAME1, NAME2 or 2, D1, ..., D10, iN1, iN2, [Dumbbell]
+ ; [Dumbbell] : bInfusion
```

`*DGN-SECT` mirrors `*SECTION` exactly — same 121 lines, same change. Both must
be converted.

### 2. `*LOADCOMB` — new trailing `LcomFactor` field  ⚠ minor

The header line of each load combination gains one field at the end:

```
2022:  NAME=NAME, KIND, ACTIVE, bES, iTYPE, DESC, iSERV-TYPE, nLCOMTYPE, nSEISTYPE
2025:  NAME=NAME, KIND, ACTIVE, bES, iTYPE, DESC, iSERV-TYPE, nLCOMTYPE, nSEISTYPE, LcomFactor
```

```
2022:    NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0
2025:    NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0, 1
```

2 lines in this model. Trailing fields are lower risk than mid-line ones, but it
should still be removed for a clean 2022 import.

### 3. `*DGN-MATL` — new trailing boolean on STEEL/SRC records  ⚠ minor

`STEEL` (and `SRC`) records gain one extra trailing boolean. `CONC` records are
unchanged. The 2025 comment header does **not** document this field.

```
2022:  ...,0, 0,0, 0, 0,
2025:  ...,0, 0,0, 0, 0,NO,
```

3 lines in this model (materials `E350`, `E410`, `E250`; the `M45` concrete
record is identical in both files).

### 4. `*VERSION` — `9.1.0` → `9.6.0`

Must be written back as `9.1.0`, otherwise Civil 2022 sees a file claiming to be
from a newer release.

### 5. `*DGN-STEEL` — new design codes  ⚠ conditional

No change to the *data* in this model (both files carry `CODE=IRC:24-2010`,
which exists in both releases), but the 2025 comment header documents **new
design codes that Civil 2022 does not have**:

| new in 2025 | closest 2022 equivalent |
|---|---|
| `KDS 41 31 : 2019` | `KSSC-LSD16` |
| `KDS 41 30 : 2022` | `KSSC-LSD16` |
| `AISC(15th)-LRFD16` | `AISC(14th)-LRFD10` |
| `AISC(15th)-ASD16` | `AISC(14th)-ASD10` |
| `NSCP 2015(LRFD)` / `NSCP 2015(ASD)` | *none — manual re-select* |
| `JRoad-H24/H14` | *none — manual re-select* |

`EUROCODE3` line 2 also grew `iKijType, iPosMcr, bRatioLinear` (and
`Q, OV, iGROUP, iFrameType` for `EUROCODE3:05`).

This is **not a problem for this model**, but it will be for a 2025 model that
uses one of those codes — there is no faithful 2022 representation, so the code
has to be substituted and the design re-run.

### 6. `*BEAMLOAD` — `ECCDIR` value  ✔ cosmetic

Every one of the 1,363 beam-load lines differs, but only in **one field**, and
only in its text:

```
2022:   2788, BEAM   , UNILOAD, GZ, NO , NO, aDir[1], , , , 0, -9.51, 1, -9.51, ...
2025:   2788, BEAM   , UNILOAD, GZ, NO , NO, LY     , , , , 0, -9.51, 1, -9.51, ...
                                        ^^^^^ field 6 = ECCDIR
```

`aDir[1]` is a **Civil 2022 export bug** — it wrote a literal internal
expression instead of a value. Civil 2025 fixed it to emit the real axis token
(`LY` = local Y).

This is **structurally harmless**: the preceding field is `bECCEN = NO` on all
1,363 lines, so eccentricity is switched off and `ECCDIR` is inert. The field
layout is unchanged (24 fields in both). It is also the reason the 2025 file is
*smaller* than the 2022 file despite carrying more data.

> Note for the converter: where `bECCEN = YES`, `ECCDIR` is **real data** and
> must be preserved, not rewritten.

### 7. Comment/format header wording  ✔ cosmetic

`;`-comment lines are ignored by the MCT parser. The 2025 headers for
`*SECTION`, `*DGN-SECT`, `*DGN-STEEL` and `*LOADCOMB` were re-worded as
described above. Rewriting them to the 2022 wording is purely so the output
looks like a native 2022 export.

---

## Summary

| # | Block | Change | Lines here | Risk |
|---|---|---|---|---|
| 1 | `*SECTION`, `*DGN-SECT` | `bHUMBLY` inserted mid-line | 121 + 121 | **BREAKING** — sections mis-read |
| 2 | `*LOADCOMB` | `LcomFactor` appended | 2 | minor |
| 3 | `*DGN-MATL` | trailing boolean appended (STEEL/SRC) | 3 | minor |
| 4 | `*VERSION` | `9.6.0` → `9.1.0` | 1 | required |
| 5 | `*DGN-STEEL` | new design codes | 0 | conditional |
| 6 | `*BEAMLOAD` | `ECCDIR` text only | 1,363 | cosmetic (inert) |
| 7 | 4 blocks | comment wording | — | cosmetic |

Everything else — nodes, elements, groups, materials, boundaries, elastic links,
static load cases, load combinations' contents, self weight, unbraced lengths,
section manager — is **identical between the two versions**.

---

## Converter

`tools/mct_downgrade.py` implements all of the above (2025 → 2022).

```bash
python3 tools/mct_downgrade.py model_2025.mct -o model_2022.mct --report report.txt
python3 tools/mct_downgrade.py model_2025.mct --check      # analyse only
```

It edits lines **in place**, so untouched lines stay byte-identical and the
original column alignment is preserved. Fields are removed by splitting on `,`
and rejoining — because MCT keeps its padding *inside* each field, this
reproduces native 2022 spacing exactly.

Anything the rules do not recognise is **reported as a warning and left alone**
rather than guessed at.

### Validation

`tools/run_tests.sh`:

```
=== T1 round-trip: convert(2025) == genuine 2022 ===
>>> PASS: byte-identical to real Civil 2022 export
=== T2 idempotency: convert(2022) == 2022 ===
>>> PASS: already-2022 file left untouched
=== T3 double conversion stability ===
>>> PASS: convert(convert(x)) == convert(x)
```

**T1 is the strong one**: converting the real `2025` export reproduces the real
`2022` export of the same model *byte for byte* (identical MD5,
`a363ad7ad461526a1e7e8fb15e023269`). That validates all seven rules against
ground truth, not just against my reading of the documentation.

`tests/synthetic_2025.mct` additionally covers the cases this model never
exercises: `COMPOSITE-B`/`COMPOSITE-I` sections, an `SRC` section with the
`[Dumbbell]` tail, a beam load with `bECCEN = YES` (must be *preserved*), and a
2025-only design code (`AISC(15th)-LRFD16`).

### Caveats

* The rules were derived from **one** model pair. They are verified against that
  pair and against the documented 2025 format comments, but a 2025 model using
  block types absent here (`*CONLOAD`, `*NODLOAD`, `*CABLE`, `*TENDON`,
  `*GEN-SECT`, time-history data, …) will pass those blocks through **unchanged
  and unverified**. The tool reports any such block so you know to check it.
* `bHUMBLY = YES` sections in 2025 have no 2022 equivalent — the dumbbell
  option is dropped. Geometry is preserved; the flag is not.
* A 2025-only design code cannot be represented in 2022; it is substituted with
  the closest predecessor and flagged. **Re-select the code and re-run design.**
* Always re-check the model in Civil 2022 after import (section properties,
  load combinations, design code) before using results.
