# MCT-CVT-100 — Comment-template refresh (cosmetic, opt-in)

- **Scope:** `;`-prefixed schema documentation lines only — never data
- **Confidence:** verified (byte-exact against both references) · cosmetic

## What it does

MIDAS embeds schema documentation as `;` comments in `.mct` files, and the
wording changed between generations. The refresh pass rewrites these templates
so converted files look native to the target generation:

- **Forward (2022 → 2025):** inserts 2025-only rows (KDS, AISC15, NSCP, JRoad,
  TAPERED steel-comp, `[Dumbbell]`), replaces reworded anchors
  (`AISC14_ASD10` → `AISC15-ASD16`, SRC → SRC_NEW), removes 2022-only rows
  (SRC_OLD, AISC13, EC3).
- **Reverse (2025 → 2022):** the mirror image — removes 2025-only rows,
  restores 2022-only ones.

29 template constants, all verified programmatically against the fixture
bytes (see `packages/mct-converter/src/comment-patches.ts`; the integration
suite asserts byte-identity including comments).

## Safety properties

- **Section-scoped:** replacement anchors resolve per-section, so identical
  templates in `*SECTION` and `*DGN-SECT` are patched independently (regression
  test: `tests/regression/comment-scope.test.ts`).
- **Idempotent:** an insert whose payload already follows the anchor is
  skipped — a second pass changes nothing.
- **Non-destructive:** unmatched anchors produce `MCT-CVT-100-UNMATCHED`
  warnings; the lines are left as-is. Data lines are never matched.
- **Line-count preserving modulo inserts/removes:** the pass accounts for all
  +13/−13 comment lines between the references.

## When to use it

Enable for files that should look indistinguishable from native target-version
exports. Leave disabled for minimal, review-friendly diffs — the model data
is identical either way.
