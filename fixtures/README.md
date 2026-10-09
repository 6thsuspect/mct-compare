# Fixtures

## Reference models (provenance-locked)

- `reference-2022.mct` — MIDAS CIVIL 2022 export (`*VERSION 9.1.0`), 7,797 lines.
- `reference-2025.mct` — MIDAS CIVIL 2025 export (`*VERSION 9.6.0`), 7,810 lines.

Both files describe the same structural model (a steel bridge: 1,973 nodes,
2,238 beam/truss elements) saved by the two CIVIL generations. Their SHA-256
hashes are pinned in `scripts/verify-fixtures.mjs` (`npm run verify:fixtures`).
Do not edit them: every byte is asserted by round-trip, diff, conversion and
validation tests. See `docs/reference-difference-report.md` for the full
evidence analysis.

## Small cases

- `conversion-cases/mini-2022.mct` — tiny 2022-shaped model with one instance
  of every version change; used by docs and manual CLI checks.
- `invalid-files/` — malformed inputs for safe-failure tests
  (`missing-refs.mct`, `empty.mct`).
- `expected-diffs/` — reserved for recorded expectation files; current tests
  assert in code instead (see `tests/`).
