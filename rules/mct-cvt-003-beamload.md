# MCT-CVT-003 — `*BEAMLOAD` ECCDIR respelling ⚠️ PROVISIONAL

- **Command:** `*BEAMLOAD`
- **Change:** field-6 token `aDir[1]` ↔ `LY`
- **Confidence:** provisional · **Review required:** YES (opt-in only)

## Evidence

All 1,363 `*BEAMLOAD` records carry `aDir[1]` at field index 6 in the 2022
reference and `LY` at the same position in the 2025 reference. First record:

2022:

```
  2788, BEAM   , UNILOAD, GZ, NO , NO, aDir[1], , , , 0, -9.51, 1, -9.51, ...
```

2025:

```
  2788, BEAM   , UNILOAD, GZ, NO , NO, LY, , , , 0, -9.51, 1, -9.51, ...
```

Positional evidence is perfect (1,363/1,363), but the token's engineering
meaning (eccentricity direction? local axis?) is undocumented in any source
available to this project. Uniformity alone cannot prove the respelling is
semantics-preserving for every model — hence provisional.

## Behaviour

- Applies only with explicit opt-in (`includeProvisional` /
  `--include-provisional`); otherwise every affected record is reported under
  `skippedProvisional` with its count, and output keeps the source token.
- The rewrite swaps only the field-6 token segment, preserving spacing.
- Records whose field 6 is neither token pass through untouched.

## Promotion criteria

Promote to verified only with MIDAS documentation (or vendor confirmation)
defining both spellings and their equivalence. Until then, every conversion
using this rule must be reviewed by a qualified engineer (validation level 4).
