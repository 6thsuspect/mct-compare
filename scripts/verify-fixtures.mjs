// Verifies the provenance of the reference fixtures (hashes recorded 2026-10-09).
// Run: npm run verify:fixtures
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = {
  "fixtures/reference-2022.mct":
    "e39757a3822e86e72c4a014e04411572b84c26b4d96810e64430a0a407a74b0b",
  "fixtures/reference-2025.mct":
    "d6d85d3a7e974e6332c3569f8a106786d8414393fc3698bb4ffb29afcc3a3ef4",
};

let failed = false;
for (const [rel, sha] of Object.entries(EXPECTED)) {
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    console.error(`MISSING  ${rel}`);
    failed = true;
    continue;
  }
  const actual = createHash("sha256").update(readFileSync(abs)).digest("hex");
  if (actual !== sha) {
    console.error(`MISMATCH ${rel}\n  expected ${sha}\n  actual   ${actual}`);
    failed = true;
  } else {
    console.log(`OK       ${rel}  sha256:${actual.slice(0, 16)}…`);
  }
}
if (failed) {
  console.error("\nReference fixtures do not match recorded hashes. See docs/reference-difference-report.md.");
  process.exit(1);
}
console.log("\nAll reference fixtures verified.");
