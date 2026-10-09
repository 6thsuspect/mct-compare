# MCT-CVT-005 — `*DGN-MATL` STEEL trailing flag ⚠️ PROVISIONAL

- **Command:** `*DGN-MATL`
- **Change:** 69-field STEEL rows ↔ 70-field rows with trailing `NO`
- **Confidence:** provisional · **Review required:** YES (opt-in only)

## Evidence

Three of the four `*DGN-MATL` records — all `STEEL` rows — gain a trailing
`NO` column (`, 0, 0,` → `, 0, 0,NO,`). The single `CONC` row (M45) is
byte-identical between the references and is correctly left untouched:

2022 STEEL tail: `…0, 0,0, 0, 0,0, 0, 0,`
2025 STEEL tail: `…0, 0,0, 0, 0,0, 0, 0,NO,`

Provisional for two compounding reasons: only three instances exist, and the
new column is undocumented in the schema comments. The trailing-`NO` pattern
resembles the verified `bHUMBLY=NO` insertion (002), but resemblance is not
evidence of meaning.

## Behaviour

- Applies only with explicit opt-in; otherwise reported under
  `skippedProvisional`.
- Forward: applies to `STEEL` rows with exactly 69 fields ending in a bare
  comma; appends `NO`. Non-STEEL rows and 70-field rows pass through.
- Reverse: strips a trailing `,NO,` from 70-field STEEL rows. Any other
  value at field 68 **blocks** the conversion (`MCT-CVT-005-LOSS`).

## Promotion criteria

Same as MCT-CVT-003: vendor documentation defining the column, plus broader
instance coverage. Until then, engineer review is mandatory.
