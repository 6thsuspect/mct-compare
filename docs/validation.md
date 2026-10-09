# Validation

Four levels, only the first two automated. The tool never claims a level it did
not actually test.

## Level 1 — File integrity (automated)

- File is non-empty and decodes as text.
- Every `*SECTION` header is well-formed; data lines carry comma-separated
  fields; section line ranges are consistent.
- Implemented in `mct-parser` (structural diagnostics) and surfaced as
  `fileOk` in the validation report.

## Level 2 — Model integrity (automated)

Implemented in `mct-validation`:

| Check | Code | Severity |
| --- | --- | --- |
| Required sections present (`*NODE` may be empty-checked per model) | `MCT-VAL-REQUIRED` | error |
| Sections contain records where the format requires them | `MCT-VAL-EMPTY` | warning |
| Element → node references resolve | `MCT-VAL-REF` | error |
| Element → material references resolve | `MCT-VAL-REF` | error |
| Element → section references resolve | `MCT-VAL-REF` | error |
| Duplicate IDs within a keyed section | `MCT-VAL-DUPE` | error |
| Load-case references (`USE-STLD`, `BEAMLOAD`, `LOADCOMB`) resolve | `MCT-VAL-REF` | error |
| Compatibility probe vs target version | `MCT-VAL-COMPAT` | warning |

Both reference fixtures validate with **zero** level-1/2 diagnostics.

## Level 3 — Target-software acceptance (manual gate)

Open the converted file in the actual MIDAS CIVIL release, import without
errors, and confirm pre/post element counts. Record the CIVIL build number in
the conversion report. This tool cannot perform this step.

## Level 4 — Engineering verification (manual gate)

A qualified engineer confirms that analysis results on the converted model
match the source within project tolerances. Nothing the tool outputs
substitutes for this review — especially conversions that applied provisional
rules (`requiresReview: true` audit entries).

## Compatibility probes

`validate --target 2025` (or the Validate tab) additionally flags constructs
known to change between generations (e.g. 18-field TAPERED headers when
targeting 2025). After a successful conversion these probes are clear — this
is asserted by `tests/integration/validate-references.test.ts`.
