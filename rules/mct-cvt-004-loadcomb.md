# MCT-CVT-004 — `*LOADCOMB` LcomFactor column

- **Command:** `*LOADCOMB`
- **Change:** 9-field `NAME=` header ↔ 10-field header with appended
  `LcomFactor=1`
- **Confidence:** verified · **Review required:** no

## Evidence

Both combinations in the pair. First header:

2022 (`reference-2022.mct:7720`):

```
   NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0
```

2025 (`reference-2025.mct:7733`):

```
   NAME=SWT, STEEL, STRENGTH, 0, 0, , 0, 0, 0, 1
```

The two sub-records (`ST, …` factor lines) are untouched in both combinations.

## Behaviour

- Forward: applies to `NAME=` header lines with exactly 9 fields; appends
  `, 1`. Sub-records pass through.
- Reverse: strips a trailing `, 1` from 10-field `NAME=` headers. If field 9
  is anything other than `1`, the record **blocks** the conversion
  (`MCT-CVT-004-LOSS`, severity `loss`) with a hint to normalise LcomFactor
  in the 2025 model first.
- Idempotent in both directions.
