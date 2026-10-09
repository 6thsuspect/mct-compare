import type { CivilVersion, ConversionRule } from "@mct/shared-types";
import { buildRules } from "./rules";

/**
 * Ordered rule registry per conversion direction. Rules run in registry
 * order; at most the rules scoped to a record's section are applied.
 */
export function getRules(from: CivilVersion, to: CivilVersion): ConversionRule[] {
  if (
    (from !== "2022" && from !== "2025") ||
    (to !== "2022" && to !== "2025")
  ) {
    return [];
  }
  return buildRules(from, to);
}

/** All known rules in both directions (for UI listing / docs). */
export function listAllRules(): ConversionRule[] {
  return [...buildRules("2022", "2025"), ...buildRules("2025", "2022")];
}
