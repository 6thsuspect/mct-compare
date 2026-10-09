import type { CivilVersion } from "@mct/shared-types";

export interface CivilAdapter {
  version: CivilVersion;
  label: string;
  /** Known `*VERSION` stamps produced by this generation. */
  mctVersions: string[];
}

/** MIDAS CIVIL 2022 generation (MCT 9.1.x). */
export const CIVIL_2022: CivilAdapter = {
  version: "2022",
  label: "MIDAS CIVIL 2022 (MCT 9.1.x)",
  mctVersions: ["9.1.0"],
};
