# Command Inventory

All 35 `*SECTION`s present in the reference pair, with record counts (identical
in both files), semantic-diff classification, and conversion behaviour.
`USE-STLD` appears twice (once per load-case block) with zero records each.

| # | Section | Records | Semantic model | Conversion |
| --- | --- | --- | --- | --- |
| 1 | `*VERSION` | 1 | version token | MCT-CVT-001 |
| 2 | `*UNIT` | 1 | keyed record | pass-through |
| 3 | `*PROJINFO` | 2 | keyed records | pass-through |
| 4 | `*STRUCTYPE` | 1 | whole-record | pass-through |
| 5 | `*REBAR-MATL-CODE` | 1 | whole-record | pass-through |
| 6 | `*NODE` | 1,973 | node IDs (coords compared) | pass-through |
| 7 | `*ELEMENT` | 2,238 | element IDs (topology compared) | pass-through |
| 8 | `*GROUP` | 30 | group names | pass-through |
| 9 | `*BNDR-GROUP` | 6 | whole-record | pass-through |
| 10 | `*LOAD-GROUP` | 7 | whole-record | pass-through |
| 11 | `*MATERIAL` | 4 | material IDs | pass-through |
| 12 | `*MATL-COLOR` | 4 | whole-record | pass-through |
| 13 | `*SECTION` | 148 | section numbers (TAPERED aware) | MCT-CVT-002A + 100 |
| 14 | `*SECT-COLOR` | 148 | whole-record | pass-through |
| 15 | `*COMP-GEN-SECT-PSC-DESIGN` | 14 | whole-record | pass-through |
| 16 | `*DGN-SECT` | 148 | section numbers (TAPERED aware) | MCT-CVT-002B + 100 |
| 17 | `*STLDCASE` | 11 | case names | pass-through |
| 18 | `*DGN-STEEL` | 2 | whole-record | MCT-CVT-100 (comments only) |
| 19 | `*CONSTRAINT` | 2 | whole-record | pass-through |
| 20 | `*SPRING` | 6 | whole-record | pass-through |
| 21 | `*ELASTICLINK` | 681 | link IDs | pass-through |
| 22 | `*FRAME-RLS` | 6 | whole-record | pass-through |
| 23 | `*LOADTOMASS` | 3 | whole-record | pass-through |
| 24 | `*USE-STLD` (×2) | 0 + 0 | header args | pass-through |
| 25 | `*BEAMLOAD` | 1,363 | element+case key | MCT-CVT-003 (provisional) |
| 26 | `*SELFWEIGHT` | 1 | whole-record | pass-through |
| 27 | `*LOADCOMB` | 2 | combination names | MCT-CVT-004 |
| 28 | `*LC-COLOR` | 13 | whole-record | pass-through |
| 29 | `*DGN-MATL` | 4 | material IDs | MCT-CVT-005 (provisional) |
| 30 | `*LENGTH` | 4 | whole-record | pass-through |
| 31 | `*LIMITSRATIO` | 1 | whole-record | pass-through |
| 32 | `*SECTION MANAGER-GROUP & PART` | 1 | whole-record | pass-through |
| 33 | `*SECTION MANAGER-STIFFENER` | 1 | whole-record | pass-through |
| 34 | `*ENDDATA` | 0 | sentinel | pass-through |

**Totals: 35 sections, 6,827 records. Zero `unclassified` semantic changes on
the reference pair; zero conversion warnings on the full-options forward pass.**

Sections not listed here (any model-specific or future commands) are handled
by the generic whole-record comparator and pass through conversion untouched.
