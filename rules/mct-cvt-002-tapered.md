# MCT-CVT-002A / 002B — TAPERED `bHUMBLY` column

- **Commands:** `*SECTION` (002A), `*DGN-SECT` (002B)
- **Change:** 18-field TAPERED header ↔ 19-field header with `bHUMBLY=NO`
  inserted at field index 14 (before `SHAPE`)
- **Confidence:** verified · **Review required:** no

## Evidence

121 TAPERED sections in `*SECTION`, mirrored 1:1 by section number in
`*DGN-SECT` (242 headers total). First instance:

2022 (`reference-2022.mct:4736`):

```
    2, TAPERED   , Nose              , CT, 0, 0, 0, 0, 0, 0, 0, 0, YES, NO, H  , 1, 1, USER
```

2025 (`reference-2025.mct:4738`):

```
    2, TAPERED   , Nose              , CT, 0, 0, 0, 0, 0, 0, 0, 0, YES, NO, NO, H  , 1, 1, USER
```

Verified programmatically: every 2022 TAPERED header has exactly 18 fields,
every 2025 one exactly 19 with `NO` at index 14. All 242 continuation payload
lines are byte-identical between the references — headers only.

## Behaviour

- Forward: applies to records whose field 1 is `TAPERED` with 18 fields;
  inserts ` NO` before field 14, preserving every other segment byte-for-byte
  (including spacing). Non-TAPERED records and already-19-field records pass
  through.
- Reverse: removes field 14 from 19-field TAPERED headers. If field 14 is
  anything other than `NO`, the record **blocks** the conversion
  (`MCT-CVT-002-LOSS`, severity `loss`) with a hint to resolve `bHUMBLY` in
  the 2025 model first — the 2022 schema cannot represent it.
- Idempotent in both directions (arity checks make re-application a no-op).
