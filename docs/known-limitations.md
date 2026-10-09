# Known Limitations

Honest boundaries of the current release. Each item is either handled safely
(pass-through / blocked / warned) or documented as future work.

## Format coverage

- The evidence base is a single model pair. Real-world files may contain
  commands never seen here (e.g. PSC, moving-load, pushover sections). Unknown
  commands **pass through conversion untouched** and are compared as
  whole-record text — safe, but a model relying on unseen version-sensitive
  commands will convert incompletely. The audit trail makes this visible:
  untouched sections simply have no entries.
- Multi-line records are grouped for known sections (TAPERED,
  SECTION MANAGER-*, PROJINFO). An unknown section with wrapped records is
  treated line-wise; semantic pairing may split it into several comparables.

## Provisional rules

- `MCT-CVT-003` (`aDir[1]` ↔ `LY`) and `MCT-CVT-005` (`*DGN-MATL` trailing
  fields) are positional rewrites without documented engineering meaning. They
  require explicit opt-in and engineering review. If MIDAS documentation later
  defines these fields, the rules should be promoted or corrected — the
  `rules/*.md` files record exactly what was assumed.

## Comment refresh

- `MCT-CVT-100` reproduces the reference templates byte-exactly, but files
  saved by different CIVIL minor builds/patches may carry slightly different
  template wording; unmatched anchors produce warnings and the lines are left
  as-is. Cosmetic only — model data is never at stake.

## Validation

- Levels 3 and 4 are manual by design (see `docs/validation.md`).
- Cross-reference checks cover element→node/material/section and load-case
  usage. Group memberships, constraint equations and tendon references are not
  yet cross-checked.
- Files over 25 MB are refused by the apps as a safety limit.

## Platform

- The desktop build targets Windows x64 (NSIS + portable). Packaging needs a
  full `npm install` on a runner with CDN access — sandboxes without it must
  set `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and cannot package.
- The web UI keeps whole files in memory; files above ~10 MB will feel slow in
  the text-diff view. The engine itself streams nothing — a deliberate
  simplicity trade-off for v1.
