import type { CivilVersion } from "@mct/shared-types";

/**
 * MCT-CVT-100: cosmetic comment-template refresh.
 *
 * Every entry below is an exact, evidence-backed line replacement observed
 * between fixtures/reference-2022.mct and fixtures/reference-2025.mct.
 * Comment patches NEVER change engineering data; they only refresh the
 * `;` schema documentation that MIDAS writes into each section header, so
 * a converted file matches what the target generation emits.
 *
 * Patches are opt-in (`refreshComments`) and applied per section scope by
 * exact-text match. Anything that does not match is left untouched with a
 * warning — never force-applied.
 */

export type CommentPatchKind = "replace" | "insert-after" | "remove";

export interface CommentPatch {
  section: string;
  kind: CommentPatchKind;
  /** Exact line text to replace/remove, or exact anchor for insert-after. */
  match: string;
  /** Replacement text (replace) or lines to insert (insert-after). */
  payload: string[];
  /** Short label for the audit trail. */
  label: string;
}

export const COMMENT_RULE_ID = "MCT-CVT-100";

// ---------------------------------------------------------------------------
// Shared SECTION-family templates (identical in SECTION and DGN-SECT)
// ---------------------------------------------------------------------------

const TAPERED_ANCHOR =
  "; iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, SHAPE, iyVAR, izVAR, STYPE                ; 1st line - TAPERED";
const TAPERED_STEEL_COMP =
  "; iSEC, TYPE, SNAME, [OFFSET2], bSD, bWE, bHUMBLY. SHAPE, iyVAR, izVAR, STYPE       ; 1st line - TAPERED(Steel Comp. Psc Comp.)";

const COMPOSITE_OLD_NEW: Array<[string, string, string]> = [
  [
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE                                      ; 1st line - COMPOSITE-B",
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, bHUMBLY, SHAPE                             ; 1st line - COMPOSITE-B",
    "COMPOSITE-B",
  ],
  [
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE                                      ; 1st line - COMPOSITE-I",
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, bHUMBLY, SHAPE                             ; 1st line - COMPOSITE-I",
    "COMPOSITE-I",
  ],
  [
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE                                      ; 1st line - COMPOSITE-TUB",
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, bHUMBLY, SHAPE                             ; 1st line - COMPOSITE-TUB",
    "COMPOSITE-TUB",
  ],
  [
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, SHAPE                                      ; 1st line - COMPOSITE-CI/CT",
    "; iSEC, TYPE, SNAME, [OFFSET], bSD, bWE, bHUMBLY, SHAPE                             ; 1st line - COMPOSITE-CI/CT",
    "COMPOSITE-CI/CT",
  ],
];

const SRC_OLD =
  "; [SRC]  : 1, DB, NAME1, NAME2 or 2, D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, iN1, iN2";
const SRC_NEW =
  "; [SRC]  : 1, DB, NAME1, NAME2 or 2, D1, D2, D3, D4, D5, D6, D7, D8, D9, D10, iN1, iN2, [Dumbbell]";
const DUMBBELL = "; [Dumbbell] : bInfusion";

function sectionFamilyPatches(
  section: string,
  from: CivilVersion,
  to: CivilVersion,
): CommentPatch[] {
  const forward = from === "2022" && to === "2025";
  if (forward) {
    return [
      {
        section,
        kind: "insert-after",
        match: TAPERED_ANCHOR,
        payload: [TAPERED_STEEL_COMP],
        label: "TAPERED(Steel Comp. Psc Comp.) template",
      },
      ...COMPOSITE_OLD_NEW.map(
        ([oldLine, newLine, label]): CommentPatch => ({
          section,
          kind: "replace",
          match: oldLine,
          payload: [newLine],
          label: `${label} bHUMBLY template`,
        }),
      ),
      {
        section,
        kind: "replace",
        match: SRC_OLD,
        payload: [SRC_NEW],
        label: "[SRC] Dumbbell template",
      },
      {
        section,
        kind: "insert-after",
        match: SRC_NEW,
        payload: [DUMBBELL],
        label: "[Dumbbell] template",
      },
    ];
  }
  return [
    {
      section,
      kind: "remove",
      match: TAPERED_STEEL_COMP,
      payload: [],
      label: "TAPERED(Steel Comp. Psc Comp.) template",
    },
    ...COMPOSITE_OLD_NEW.map(
      ([oldLine, newLine, label]): CommentPatch => ({
        section,
        kind: "replace",
        match: newLine,
        payload: [oldLine],
        label: `${label} bHUMBLY template`,
      }),
    ),
    {
      section,
      kind: "remove",
      match: DUMBBELL,
      payload: [],
      label: "[Dumbbell] template",
    },
    {
      section,
      kind: "replace",
      match: SRC_NEW,
      payload: [SRC_OLD],
      label: "[SRC] Dumbbell template",
    },
  ];
}

// ---------------------------------------------------------------------------
// DGN-STEEL templates
// ---------------------------------------------------------------------------

const KSSC_LSD16 =
  "; [KSSC-LSD16]    : PHI-T1, PHI-T2, PHI-C, PHI-B, PHI-V, bSPECIAL, FRAMETYPE, bSCWB ; line 2";
const KDS_2019 =
  "; [KDS 41 31 : 2019]    : PHI-T1, PHI-T2, PHI-C, PHI-B, PHI-V, bSPECIAL, FRAMETYPE, bSCWB, bUGLcom ; line 2";
const KDS_2022 =
  "; [KDS 41 30 : 2022] : PHI-T1, PHI-T2, PHI-C, PHI-B, PHI-V, bSPECIAL, FRAMETYPE, bSCWB, bUGLcom ; line 2";
const AISC14_LRFD =
  "; [AISC(14th)-LRFD10] : PHI-T1, PHI-T2, PHI-C, PHT-B, PHI-V, bSPECIAL, FRAMETYPE, bSCWB ; line 2";
const AISC15_LRFD =
  "; [AISC(15th)-LRFD16] : PHI-T1, PHI-T2, PHI-C, PHT-B, PHI-V, bSPECIAL, FRAMETYPE, bSCWB ; line 2";
const AISC13_ASD10 =
  "; [AISC(13th)-ASD10]  : OMEGA-T1, OMEGA-T2, OMEGA-C, OMEGA-B, OMEGA-V, bSPECIAL, FRAMETYPE , bSCWB; line 2";
const AISC14_ASD10 =
  "; [AISC(14th)-ASD10]  : OMEGA-T1, OMEGA-T2, OMEGA-C, OMEGA-B, OMEGA-V, bSPECIAL, FRAMETYPE , bSCWB; line 2";
const AISC15_ASD16 =
  "; [AISC(15th)-ASD16]  : OMEGA-T1, OMEGA-T2, OMEGA-C, OMEGA-B, OMEGA-V, bSPECIAL, FRAMETYPE , bSCWB; line 2";
const EC3 =
  "; [EUROCODE3]     : GAMMA-M0, GAMMA-M1, GAMMA-M2, iSCODE, iUseMaxForce ; line 2";
const EC3_NEW =
  "; [EUROCODE3]     : GAMMA-M0, GAMMA-M1, GAMMA-M2, iSCODE, iUseMaxForce, iKijType, iPosMcr, bRatioLinear ; line 2";
const EC3_05 =
  "; [EUROCODE3:05]  : GAMMA-M0, GAMMA-M1, GAMMA-M2, iSCODE, iUseMaxForce ; line 2";
const EC3_05_NEW =
  "; [EUROCODE3:05]  : GAMMA-M0, GAMMA-M1, GAMMA-M2, iSCODE, iUseMaxForce, iKijType, iPosMcr, bRatioLinear, Q, OV, iGROUP, iFrameType ; line 2";
const EC3_2_05 =
  "; [EUROCODE3-2:05]: GAMMA-M0, GAMMA-M1, GAMMA-M2, iSCODE, iUseMaxForce ; line 2";
const EC3_2_05_NEW =
  "; [EUROCODE3-2:05]: GAMMA-M0, GAMMA-M1, GAMMA-M2, iSCODE, iUseMaxForce, iKijType, iPosMcr, bRatioLinear ; line 2";
const IS800_2007 =
  "; [IS:800-2007]   : GAMMA-M0, GAMMA-M1                        ; ";
const NSCP_LRFD =
  "; [NSCP 2015(LRFD)] : PHI-T1, PHI-T2, PHI-C, PHT-B, PHI-V, bSPECIAL, FRAMETYPE, bSCWB ; line 2";
const NSCP_ASD =
  "; [NSCP 2015(ASD)]  : OMEGA-T1, OMEGA-T2, OMEGA-C, OMEGA-B, OMEGA-V, bSPECIAL, FRAMETYPE , bSCWB; line 2";
const KSCE_CHK5 =
  ";                 : bPRINT_CHK1, ... bPRINT_CHK5              ; line3 ";
const JROAD_1 =
  "; [JRoad-H24/H14] : iShearCalcOpt, iDgnFoceOpt                ; line2 ";
const JROAD_2 =
  ";                 : iDGN_LCOM, bENVE_FORCE1, ... bENVE_FORCE12; line3 ";
const JROAD_3 =
  ";                 : bPRINT_CHK1, ... bPRINT_CHK3              ; line4 ";

function dgnSteelPatches(from: CivilVersion, to: CivilVersion): CommentPatch[] {
  const S = "DGN-STEEL";
  const forward = from === "2022" && to === "2025";
  if (forward) {
    return [
      { section: S, kind: "insert-after", match: KSSC_LSD16, payload: [KDS_2019, KDS_2022], label: "KDS templates" },
      { section: S, kind: "insert-after", match: AISC14_LRFD, payload: [AISC15_LRFD], label: "AISC(15th)-LRFD16 template" },
      { section: S, kind: "replace", match: AISC13_ASD10, payload: [AISC14_ASD10], label: "AISC(14th)-ASD10 template" },
      { section: S, kind: "insert-after", match: AISC14_ASD10, payload: [AISC15_ASD16], label: "AISC(15th)-ASD16 template" },
      { section: S, kind: "replace", match: EC3, payload: [EC3_NEW], label: "EUROCODE3 template" },
      { section: S, kind: "replace", match: EC3_05, payload: [EC3_05_NEW], label: "EUROCODE3:05 template" },
      { section: S, kind: "replace", match: EC3_2_05, payload: [EC3_2_05_NEW], label: "EUROCODE3-2:05 template" },
      { section: S, kind: "insert-after", match: IS800_2007, payload: [NSCP_LRFD, NSCP_ASD], label: "NSCP 2015 templates" },
      { section: S, kind: "insert-after", match: KSCE_CHK5, payload: [JROAD_1, JROAD_2, JROAD_3], label: "JRoad-H24/H14 templates" },
    ];
  }
  return [
    { section: S, kind: "remove", match: KDS_2019, payload: [], label: "KDS templates" },
    { section: S, kind: "remove", match: KDS_2022, payload: [], label: "KDS templates" },
    { section: S, kind: "remove", match: AISC15_LRFD, payload: [], label: "AISC(15th)-LRFD16 template" },
    { section: S, kind: "remove", match: AISC15_ASD16, payload: [], label: "AISC(15th)-ASD16 template" },
    { section: S, kind: "replace", match: AISC14_ASD10, payload: [AISC13_ASD10], label: "AISC(14th)-ASD10 template" },
    { section: S, kind: "replace", match: EC3_NEW, payload: [EC3], label: "EUROCODE3 template" },
    { section: S, kind: "replace", match: EC3_05_NEW, payload: [EC3_05], label: "EUROCODE3:05 template" },
    { section: S, kind: "replace", match: EC3_2_05_NEW, payload: [EC3_2_05], label: "EUROCODE3-2:05 template" },
    { section: S, kind: "remove", match: NSCP_LRFD, payload: [], label: "NSCP 2015 templates" },
    { section: S, kind: "remove", match: NSCP_ASD, payload: [], label: "NSCP 2015 templates" },
    { section: S, kind: "remove", match: JROAD_1, payload: [], label: "JRoad-H24/H14 templates" },
    { section: S, kind: "remove", match: JROAD_2, payload: [], label: "JRoad-H24/H14 templates" },
    { section: S, kind: "remove", match: JROAD_3, payload: [], label: "JRoad-H24/H14 templates" },
  ];
}

// ---------------------------------------------------------------------------
// LOADCOMB templates
// ---------------------------------------------------------------------------

const LCMB1_OLD =
  "; NAME=NAME, KIND, ACTIVE, bES, iTYPE, DESC, iSERV-TYPE, nLCOMTYPE, nSEISTYPE   ; line 1";
const LCMB1_NEW =
  "; NAME=NAME, KIND, ACTIVE, bES, iTYPE, DESC, iSERV-TYPE, nLCOMTYPE, nSEISTYPE, LcomFactor ; line 1";
const LCMB2_OLD =
  ";      ANAL1, LCNAME1, FACT1, ...                                               ; from line 2";
const LCMB2_NEW =
  ";      ANAL1, LCNAME1, FACT1, ...                                                         ; from line 2";

function loadcombPatches(from: CivilVersion, to: CivilVersion): CommentPatch[] {
  const S = "LOADCOMB";
  const forward = from === "2022" && to === "2025";
  return forward
    ? [
        { section: S, kind: "replace", match: LCMB1_OLD, payload: [LCMB1_NEW], label: "LOADCOMB header template" },
        { section: S, kind: "replace", match: LCMB2_OLD, payload: [LCMB2_NEW], label: "LOADCOMB factor template" },
      ]
    : [
        { section: S, kind: "replace", match: LCMB1_NEW, payload: [LCMB1_OLD], label: "LOADCOMB header template" },
        { section: S, kind: "replace", match: LCMB2_NEW, payload: [LCMB2_OLD], label: "LOADCOMB factor template" },
      ];
}

// ---------------------------------------------------------------------------

export function commentPatches(
  from: CivilVersion,
  to: CivilVersion,
): CommentPatch[] {
  if (from === to) return [];
  return [
    ...sectionFamilyPatches("SECTION", from, to),
    ...sectionFamilyPatches("DGN-SECT", from, to),
    ...dgnSteelPatches(from, to),
    ...loadcombPatches(from, to),
  ];
}
