# MCT-CVT-006 — REJECTED (no rule)

During analysis, every section outside the five data rules above was checked
for systematic differences. All remaining sections — `*NODE`, `*ELEMENT`,
`*MATERIAL`, `*GROUP`, `*CONSTRAINT`, `*SPRING`, `*ELASTICLINK`, `*FRAME-RLS`,
`*STLDCASE`, `*SELFWEIGHT`, `*LC-COLOR`, `*LENGTH`, `*LIMITSRATIO`,
`*SECTION MANAGER-*`, and the rest — are byte-identical between the
references (modulo the comment templates covered by MCT-CVT-100).

A sixth data rule was therefore considered and **explicitly rejected**: there
is no sixth systematic difference to encode, and inventing a rule without a
difference would violate the project's evidence standard.

This file exists so the decision is recorded and reviewable. If a future model
pair reveals a genuine sixth difference, it should be proposed as a new rule
with its own evidence file — not shoehorned into this number.
