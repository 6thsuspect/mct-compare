# Conversion Audit Schema

`convertDocument` returns a `ConversionReport` (see
`packages/shared-types/src/index.ts`). The machine-readable form is the
`.audit.json` export (CLI `--audit`, web Convert tab); the human form is the
markdown report.

```jsonc
{
  "from": "2022",            // requested source generation
  "to": "2025",              // requested target generation
  "detectedSourceVersion": "2022", // version actually detected in the input
  "recordsExamined": 6827,
  "recordsChanged": 1611,
  "ok": true,                // false if any severity=loss diagnostic exists
  "applied": [               // one entry per changed record (or comment edit)
    {
      "ruleId": "MCT-CVT-003",
      "section": "BEAMLOAD",
      "startLine": 6336,     // 1-based, in the SOURCE file
      "endLine": 6336,
      "before": ["  10, BEAM, ..."],
      "after": ["  10, BEAM, ..."],
      "severity": "warning", // info | warning | error | loss
      "message": "MCT-CVT-003 (provisional): ..."
    }
  ],
  "skippedProvisional": [    // provisional rules NOT applied (no opt-in)
    { "ruleId": "MCT-CVT-003", "section": "BEAMLOAD", "count": 1363, "message": "..." }
  ],
  "diagnostics": [           // file/section/line diagnostics (incl. warnings)
    { "severity": "warning", "code": "MCT-CVT-100-UNMATCHED", "message": "..." }
  ]
  // "output": "<converted .mct text>" — present unless dryRun; omitted from .audit.json
}
```

Conventions:

- `before`/`after` hold the exact source/target lines (trimmed only for
  display by the UIs, never in the JSON).
- Comment-refresh entries use `ruleId: "MCT-CVT-100"` with `before: []` for
  pure insertions.
- `skippedProvisional[].count` aggregates affected records per rule so a
  dry-run still quantifies what opt-in would change.
- `ok: false` blocks the CLI from writing output (exit code 2) and shows
  VERDICT: BLOCKED in the UIs.
