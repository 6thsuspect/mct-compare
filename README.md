# mct-compare

Comparison of the **MIDAS Civil MCT** text-command format between **Civil 2025
(v9.6.0)** and **Civil 2022 (v9.1.0)**, plus a converter that downgrades a 2025
MCT file so Civil 2022 can import it.

## Files

| path | what it is |
|---|---|
| `2022` | reference MCT export from Civil 2022 (v9.1.0) |
| `2025` | reference MCT export from Civil 2025 (v9.6.0) — **same model** |
| `MCT_2025_vs_2022_DIFF.md` | **the comparison report** — start here |
| `tools/mct_downgrade.py` | converter, Civil 2025 MCT → Civil 2022 MCT |
| `tools/run_tests.sh` | regression suite (round-trip / idempotency / stability) |
| `analysis/` | the scripts used to produce the comparison |
| `tests/synthetic_2025.mct` | hand-built 2025 file covering cases the reference model lacks |

## Usage

```bash
# convert a Civil 2025 MCT file to Civil 2022 format
python3 tools/mct_downgrade.py model_2025.mct -o model_2022.mct --report report.txt

# analyse without writing anything
python3 tools/mct_downgrade.py model_2025.mct --check

# run the tests
bash tools/run_tests.sh
```

The converter edits lines in place, so anything it does not have a rule for is
left byte-identical and reported as a warning rather than guessed at.

## Headline result

Converting the real `2025` export reproduces the real `2022` export of the same
model **byte for byte** (identical MD5). See the report for the seven format
differences that rule set covers.
