# MCT-CVT-001 — `*VERSION` stamp

- **Command:** `*VERSION`
- **Change:** `9.1.0` ↔ `9.6.0`
- **Confidence:** verified · **Review required:** no

## Evidence

| File | Line 7 |
| --- | --- |
| `fixtures/reference-2022.mct` | `   9.1.0` |
| `fixtures/reference-2025.mct` | `   9.6.0` |

The version token is also the primary input to version detection
(`detectVersion`): `9.x` with minor < 6 ⇒ 2022, ≥ 6 ⇒ 2025, combined with
structural probes (TAPERED arity, BEAMLOAD token).

## Behaviour

- Forward: replaces the `9.1.0` stamp with `9.6.0` (exact-token match).
- Reverse: replaces `9.6.0` with `9.1.0`.
- A file already at the target stamp is a no-op (idempotent).
- No other line is touched; surrounding whitespace is preserved.

## Failure mode

None — if the expected stamp is absent the rule simply does not apply and
detection reports the mismatch in the conversion report (`--dry-run` shows it
before anything is written).
