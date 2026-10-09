#!/usr/bin/env python3
"""
mct_downgrade.py -- Convert a MIDAS Civil 2025 (v9.6.0) MCT command file into a
                    MIDAS Civil 2022 (v9.1.0) compatible MCT file.

The transforms implemented here were derived by a field-by-field diff of two MCT
exports of the *same* model, one from Civil 2022 and one from Civil 2025
(see analysis/ and MCT_2025_vs_2022_DIFF.md in this repository).

Design notes
------------
* The file is processed LINE-BY-LINE IN PLACE.  Lines that need no change are
  emitted byte-for-byte identical to the input, so the output preserves the
  original column alignment / whitespace exactly.
* Fields are removed by splitting on ',' and rejoining with ','.  Because MCT
  keeps the padding *inside* each field, this reproduces the native 2022
  spacing exactly (verified by round-trip test).
* Every change is counted and reported.  Anything the rules do not recognise is
  reported as a WARNING for manual review rather than silently mangled.

Usage
-----
    python3 mct_downgrade.py INPUT.mct -o OUTPUT.mct
    python3 mct_downgrade.py INPUT.mct -o OUTPUT.mct --report report.txt
    python3 mct_downgrade.py INPUT.mct --check          # report only, no write
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from collections import Counter, OrderedDict

# --------------------------------------------------------------------------- #
# Version / profile constants
# --------------------------------------------------------------------------- #

VERSION_2022 = "9.1.0"
VERSION_2025 = "9.6.0"

# Section TYPEs that gained the bHUMBLY ("dumbbell") flag in 2025.
# For each: the 0-based index of the flag on the section's FIRST line, plus the
# total first-line field count in each format.  The field count is what makes the
# rule unambiguous and idempotent -- an already-2022 line simply will not match.
#
#   TAPERED      uses [OFFSET2] (9 fields, idx 3..11)
#                -> bSD=12 bWE=13 [bHUMBLY=14] SHAPE=15 iyVAR=16 izVAR=17 STYPE=18
#                2022 = 18 fields, 2025 = 19 fields   (verified against reference)
#   COMPOSITE-*  uses [OFFSET]  (7 fields, idx 3..9)
#                -> bSD=10 bWE=11 [bHUMBLY=12] SHAPE=13
#                2022 = 13 fields, 2025 = 14 fields   (derived from 2025 docs)
#
BHUMBLY_SPEC = {
    "TAPERED":          {"idx": 14, "n2022": 18, "n2025": 19},
    "COMPOSITE-B":      {"idx": 12, "n2022": 13, "n2025": 14},
    "COMPOSITE-I":      {"idx": 12, "n2022": 13, "n2025": 14},
    "COMPOSITE-TUB":    {"idx": 12, "n2022": 13, "n2025": 14},
    "COMPOSITE-CI/CT":  {"idx": 12, "n2022": 13, "n2025": 14},
}
BHUMBLY_INDEX = {k: v["idx"] for k, v in BHUMBLY_SPEC.items()}

# SRC sections gained a trailing '[Dumbbell] : bInfusion' on their 2nd line when
# [SRC] uses the value form (2, D1..D10, iN1, iN2).  That tail is detected by the
# trailing YES/NO word rather than by an exact field count, so it stays correct
# even when the number of dimension values differs from the documented ten.
# See SectionTransformer._continuation.

# Word booleans only.  '0'/'1' are deliberately excluded: they are legitimate
# numeric data throughout MCT and treating them as booleans is what made an
# earlier revision of this rule non-idempotent.
BOOL_WORDS = {"YES", "NO"}

# Section TYPEs whose FIRST line never carries bHUMBLY (unchanged 2022 -> 2025).
SECTION_TYPE_NO_HUMBLY = {
    "DBUSER", "DB/USER", "VALUE", "SRC", "COMBINED", "CONSTRUCT", "PSC",
}

# Every legal section TYPE token (field[1] of a section header line).  Used to
# tell a section's first line apart from its continuation lines.
SECTION_TYPES = set(BHUMBLY_INDEX) | SECTION_TYPE_NO_HUMBLY


# Design codes that exist in Civil 2025 but NOT in Civil 2022.  If the input
# model selects one of these we cannot represent it faithfully in 2022.
CODES_NEW_IN_2025 = {
    "KDS 41 31 : 2019", "KDS 41 30 : 2022",
    "AISC(15TH)-LRFD16", "AISC(15TH)-ASD16",
    "NSCP 2015(LRFD)", "NSCP 2015(ASD)",
    "JROAD-H24/H14",
}
# Suggested 2022 fallback for each unsupported 2025 code (closest predecessor).
CODE_FALLBACK = {
    "KDS 41 31 : 2019":  "KSSC-LSD16",
    "KDS 41 30 : 2022":  "KSSC-LSD16",
    "AISC(15TH)-LRFD16": "AISC(14TH)-LRFD10",
    "AISC(15TH)-ASD16":  "AISC(14TH)-ASD10",
}

BLOCK_RE = re.compile(r"^\*([A-Za-z0-9 ,&_\-]+?)\s*(?:;.*)?$")


# --------------------------------------------------------------------------- #
# Reporting
# --------------------------------------------------------------------------- #

class Report:
    def __init__(self) -> None:
        self.changes: Counter = Counter()
        self.warnings: list[str] = []
        self.notes: list[str] = []

    def changed(self, what: str, n: int = 1) -> None:
        self.changes[what] += n

    def warn(self, msg: str) -> None:
        if msg not in self.warnings:
            self.warnings.append(msg)

    def note(self, msg: str) -> None:
        self.notes.append(msg)

    def text(self) -> str:
        out = []
        out.append("=" * 78)
        out.append("MCT 2025 -> 2022 CONVERSION REPORT")
        out.append("=" * 78)
        if not self.changes:
            out.append("No changes were required.")
        else:
            out.append("Changes applied:")
            for k, n in sorted(self.changes.items(), key=lambda kv: -kv[1]):
                out.append(f"  {n:7d}  {k}")
        if self.warnings:
            out.append("")
            out.append("WARNINGS (manual review recommended):")
            for w in self.warnings:
                out.append(f"  ! {w}")
        if self.notes:
            out.append("")
            out.append("Notes:")
            for i in self.notes:
                out.append(f"  - {i}")
        out.append("=" * 78)
        return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- #
# Field helpers
# --------------------------------------------------------------------------- #

def split_fields(line: str) -> list[str]:
    """Split an MCT data line into fields, keeping the original padding."""
    return line.split(",")


def join_fields(fields: list[str]) -> str:
    return ",".join(fields)


def drop_field(line: str, idx: int) -> str:
    f = split_fields(line)
    del f[idx]
    return join_fields(f)


def set_field(line: str, idx: int, raw_value: str) -> str:
    f = split_fields(line)
    f[idx] = raw_value
    return join_fields(f)


def is_blank_or_comment(line: str) -> bool:
    s = line.strip()
    return s == "" or s.startswith(";")


# --------------------------------------------------------------------------- #
# Block-scoped line transformers
# --------------------------------------------------------------------------- #

def xform_version(line: str, rep: Report, target: str) -> str:
    if is_blank_or_comment(line):
        return line
    old = line.strip()
    if old == target:
        return line
    indent = line[: len(line) - len(line.lstrip())]
    rep.changed(f"*VERSION: '{old}' -> '{target}'")
    return f"{indent}{target}"


class SectionTransformer:
    """
    Stateful transformer for *SECTION / *DGN-SECT.

    State is needed because a section record spans several lines and only the
    FIRST line names the section TYPE; the continuation lines have to be judged
    in the context of the record they belong to (e.g. the SRC [Dumbbell] tail).
    One instance per block per conversion.
    """

    def __init__(self, rep: Report, block: str) -> None:
        self.rep = rep
        self.block = block
        self.cur_type: str | None = None
        self.cur_variant: str | None = None

    def __call__(self, line: str) -> str:
        if is_blank_or_comment(line):
            return line

        f = split_fields(line)
        if len(f) < 3:
            return line

        stype = f[1].strip().upper()

        if stype in SECTION_TYPES:
            return self._header(line, f, stype)
        return self._continuation(line, f)

    # -- section first line --------------------------------------------------
    def _header(self, line: str, f: list[str], stype: str) -> str:
        self.cur_type = stype
        self.cur_variant = None

        spec = BHUMBLY_SPEC.get(stype)
        if spec is None:
            # DBUSER / VALUE / SRC / COMBINED / CONSTRUCT / PSC : layout unchanged
            if stype == "SRC":
                self.cur_variant = "src-first"
            return line

        idx, n2022, n2025 = spec["idx"], spec["n2022"], spec["n2025"]

        if len(f) == n2022:
            return line                  # already Civil 2022 -> silent no-op

        if len(f) == n2025:
            val = f[idx].strip()
            if val in BOOL_WORDS:
                self.rep.changed(f"{self.block}: removed bHUMBLY='{val}' from {stype} section")
                return drop_field(line, idx)
            self.rep.warn(
                f"{self.block}: '{stype}' line has the 2025 field count ({n2025}) but "
                f"field {idx} is '{val}', not YES/NO. Left untouched for safety:\n"
                f"      {line.strip()}"
            )
            return line

        self.rep.warn(
            f"{self.block}: '{stype}' line has {len(f)} fields, expected {n2025} (2025) "
            f"or {n2022} (2022). Left untouched for safety:\n      {line.strip()}"
        )
        return line

    # -- continuation lines --------------------------------------------------
    def _continuation(self, line: str, f: list[str]) -> str:
        # SRC record, 2nd line, value form of [SRC]:
        #     D1, D2, 2, D1..D10, iN1, iN2 [, bInfusion]
        # 2025 appends bInfusion.  Detected by the trailing YES/NO word rather
        # than by an exact field count, so it stays correct even if the number of
        # dimension values differs.
        if self.cur_type == "SRC" and len(f) >= 4 and f[2].strip() == "2":
            if f[-1].strip() in BOOL_WORDS:
                self.rep.changed(f"{self.block}: stripped SRC [Dumbbell]/bInfusion tail")
                return drop_field(line, len(f) - 1)
        return line


def make_section_xform(rep: Report, block: str):
    st = SectionTransformer(rep, block)
    return lambda line, _rep: st(line)


def xform_beamload(line: str, rep: Report) -> str:
    """
    2022 wrote the literal string 'aDir[1]' into the ECCDIR slot; 2025 writes
    the real axis token (e.g. 'LY').  Field layout:

        ELEM_LIST, CMD, TYPE, DIR, bPROJ, [bECCEN, ECCDIR, I-END, J-END, bJ-END], ...
           0        1    2     3     4       5       6      7      8      9

    ECCDIR only carries information when bECCEN == YES.  When bECCEN == NO the
    slot is inert, so we reproduce the 2022 native token for an exact match.
    When bECCEN == YES the value is REAL data and must be preserved.
    """
    if is_blank_or_comment(line):
        return line

    f = split_fields(line)
    if len(f) < 10:
        return line

    cmd = f[1].strip().upper()
    if cmd not in ("BEAM", "GIRDER"):
        return line

    beccen = f[5].strip().upper()
    eccdir = f[6].strip()

    if beccen in ("YES", "1"):
        # Real eccentricity data: keep the 2025 axis token (2022 understands
        # axis tokens; 'aDir[1]' is only what 2022's *writer* emitted).
        if eccdir and eccdir != "aDir[1]":
            rep.warn(
                "*BEAMLOAD: element(s) have bECCEN=YES with ECCDIR="
                f"'{eccdir}'. Value preserved as-is -- verify load eccentricity "
                "in Civil 2022 after import:\n      " + line.strip()
            )
        return line

    # bECCEN == NO -> inert slot, reproduce 2022's native output.
    if eccdir == "aDir[1]":
        return line
    if eccdir == "":
        return line
    rep.changed(f"*BEAMLOAD: ECCDIR '{eccdir}' -> 'aDir[1]' (bECCEN=NO, inert)")
    return set_field(line, 6, " aDir[1]")


def xform_loadcomb(line: str, rep: Report) -> str:
    """Drop the trailing 'LcomFactor' field added to combination header lines."""
    if is_blank_or_comment(line):
        return line
    if not line.lstrip().startswith("NAME="):
        return line                      # continuation line (ANAL, LCNAME, FACT)
    f = split_fields(line)
    # 2022 header: NAME,KIND,ACTIVE,bES,iTYPE,DESC,iSERV,nLCOMTYPE,nSEISTYPE = 9
    if len(f) == 10:
        rep.changed("*LOADCOMB: removed trailing LcomFactor field")
        return drop_field(line, 9)
    if len(f) > 10:
        rep.warn(f"*LOADCOMB: unexpected field count {len(f)}:\n      {line.strip()}")
    return line


def xform_dgn_matl(line: str, rep: Report) -> str:
    """
    2025 appends an extra boolean to STEEL / SRC records of *DGN-MATL
    (observed: '...,NO,' where 2022 emits '...,' ).  CONC records are unchanged.
    """
    if is_blank_or_comment(line):
        return line
    f = split_fields(line)
    if len(f) < 4:
        return line
    mtype = f[1].strip().upper()
    if mtype not in ("STEEL", "SRC"):
        return line
    # 2025 tail: '...,NO,' / '...,YES,'  (a boolean WORD, then a trailing comma).
    # 2022 tail: '...,0,'               (numeric) -> correctly left alone, which
    # is what makes this rule idempotent.
    if len(f) >= 2 and f[-1].strip() == "" and f[-2].strip() in BOOL_WORDS:
        rep.changed(f"*DGN-MATL: removed trailing boolean '{f[-2].strip()}' from {mtype} record")
        return drop_field(line, len(f) - 2)
    if f[-2].strip() not in BOOL_WORDS and f[-1].strip() in BOOL_WORDS:
        # boolean word is the very last field, no trailing comma
        rep.changed(f"*DGN-MATL: removed trailing boolean '{f[-1].strip()}' from {mtype} record")
        return drop_field(line, len(f) - 1)
    return line


def xform_dgn_steel(line: str, rep: Report) -> str:
    """*DGN-STEEL data is unchanged, but guard against 2025-only design codes."""
    if is_blank_or_comment(line):
        return line
    if not line.lstrip().upper().startswith("CODE="):
        return line
    m = re.match(r"^(\s*CODE=)([^,]*)(.*)$", line)
    if not m:
        return line
    code = m.group(2).strip()
    if code.upper() in CODES_NEW_IN_2025:
        fb = CODE_FALLBACK.get(code.upper())
        if fb:
            rep.warn(
                f"*DGN-STEEL: design code '{code}' does not exist in Civil 2022. "
                f"Substituted '{fb}' -- RE-SELECT the design code in 2022 and "
                "re-run design."
            )
            rep.changed(f"*DGN-STEEL: code '{code}' -> '{fb}'")
            pad = m.group(2)[: len(m.group(2)) - len(m.group(2).lstrip())]
            return f"{m.group(1)}{pad}{fb}{m.group(3)}"
        rep.warn(
            f"*DGN-STEEL: design code '{code}' does not exist in Civil 2022 and has "
            "no automatic fallback -- RE-SELECT the design code after import."
        )
    return line


# --------------------------------------------------------------------------- #
# Comment-header synchronisation
# --------------------------------------------------------------------------- #

def load_comment_profile(path: str) -> dict[str, list[str]]:
    """Read the ';'-comment header of every block from a reference MCT file."""
    prof: dict[str, list[str]] = {}
    cur = None
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for raw in fh:
            line = raw.rstrip("\r\n")
            m = BLOCK_RE.match(line)
            if line.startswith("*") and m:
                cur = m.group(1).strip()
                prof.setdefault(cur, [])
                continue
            if cur is not None and line.strip().startswith(";"):
                prof[cur].append(line)
    return prof


def sync_comments(lines: list[str], profile: dict[str, list[str]],
                  rep: Report, only: set[str]) -> list[str]:
    """
    Replace the format-documentation comment header of selected blocks with the
    2022 wording taken from the reference profile.  Comments are ignored by the
    MCT parser; this is purely so the output looks like a native 2022 export.
    """
    out: list[str] = []
    cur = None
    replaced: set[str] = set()
    pending_emit = False
    i = 0
    while i < len(lines):
        line = lines[i]
        m = BLOCK_RE.match(line)
        if line.startswith("*") and m:
            cur = m.group(1).strip()
            out.append(line)
            i += 1
            if cur in only and cur in profile:
                # collect this block's comment lines
                j = i
                while j < len(lines) and lines[j].strip().startswith(";"):
                    j += 1
                new_c = profile[cur]
                old_c = lines[i:j]
                if old_c != new_c:
                    out.extend(new_c)
                    replaced.add(cur)
                else:
                    out.extend(old_c)
                i = j
            continue
        out.append(line)
        i += 1
    for b in sorted(replaced):
        rep.changed(f"{b}: comment header re-worded to Civil 2022 format")
    return out


# --------------------------------------------------------------------------- #
# Main conversion
# --------------------------------------------------------------------------- #

# block name -> transformer factory (called once per conversion run)
def build_line_xforms(rep: Report) -> dict:
    return {
        "VERSION":    lambda l, r: xform_version(l, r, VERSION_2022),
        "SECTION":    make_section_xform(rep, "*SECTION"),
        "DGN-SECT":   make_section_xform(rep, "*DGN-SECT"),
        "BEAMLOAD":   xform_beamload,
        "LOADCOMB":   xform_loadcomb,
        "DGN-MATL":   xform_dgn_matl,
        "DGN-STEEL":  xform_dgn_steel,
    }

COMMENT_SYNC_BLOCKS = {"SECTION", "DGN-SECT", "DGN-STEEL", "LOADCOMB"}


def convert(text: str, rep: Report, comment_profile: dict | None = None,
            sync_hdr: bool = True) -> str:
    lines = text.split("\n")
    # remember whether the file ended with a newline
    trailing_nl = text.endswith("\n")
    if trailing_nl:
        lines = lines[:-1]

    cur = None
    seen: set[str] = set()
    out: list[str] = []
    xforms = build_line_xforms(rep)
    for line in lines:
        m = BLOCK_RE.match(line)
        if line.startswith("*") and m:
            cur = m.group(1).strip()
            seen.add(cur)
            out.append(line)
            continue
        xf = xforms.get(cur) if cur else None
        out.append(xf(line, rep) if xf else line)

    # ---- structural sanity checks -----------------------------------------
    expected = {"VERSION", "NODE", "ELEMENT", "SECTION", "ENDDATA"}
    missing = expected - seen
    if missing:
        rep.warn(f"Input is missing expected block(s): {', '.join(sorted(missing))}")
    if "ENDDATA" not in seen:
        rep.warn("No *ENDDATA terminator found; MIDAS may reject the file.")

    unknown_new = seen - set(KNOWN_BLOCKS)
    if unknown_new:
        rep.note(
            "Block(s) not present in the 2022/2025 reference pair were passed "
            "through unchanged and are NOT verified for 2022 compatibility: "
            + ", ".join(sorted(unknown_new))
        )

    if sync_hdr and comment_profile:
        out = sync_comments(out, comment_profile, rep, COMMENT_SYNC_BLOCKS)

    result = "\n".join(out)
    if trailing_nl:
        result += "\n"
    return result


KNOWN_BLOCKS = {
    "VERSION", "UNIT", "PROJINFO", "STRUCTYPE", "REBAR-MATL-CODE", "NODE",
    "ELEMENT", "GROUP", "BNDR-GROUP", "LOAD-GROUP", "MATERIAL", "MATL-COLOR",
    "SECTION", "SECT-COLOR", "COMP-GEN-SECT-PSC-DESIGN", "DGN-SECT", "STLDCASE",
    "DGN-STEEL", "DGN-CONC", "CONSTRAINT", "SPRING", "ELASTICLINK", "FRAME-RLS",
    "LOADTOMASS", "USE-STLD, Girder Weight", "BEAMLOAD", "USE-STLD, SW",
    "SELFWEIGHT", "LOADCOMB", "LC-COLOR", "DGN-MATL", "LENGTH", "LIMITSRATIO",
    "SECTION MANAGER-GROUP & PART", "SECTION MANAGER-STIFFENER", "ENDDATA",
    "CONLOAD", "NODLOAD", "CON-LOADCASE", "GEN-SECT", "CABLE", "TENDON",
    "TENDONLOAD", "GNLD-STRESS", "STRESS", "NLMATERIAL", "DGN-SECTION",
}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Convert a MIDAS Civil 2025 MCT file to MIDAS Civil 2022 format.")
    ap.add_argument("input", help="input .mct file (Civil 2025)")
    ap.add_argument("-o", "--output", help="output .mct file (Civil 2022)")
    ap.add_argument("--report", help="write the conversion report to this file")
    ap.add_argument("--check", action="store_true",
                    help="analyse only; do not write an output file")
    ap.add_argument("--no-sync-comments", action="store_true",
                    help="keep the 2025 comment/format header wording")
    ap.add_argument("--comment-profile",
                    help="reference Civil 2022 MCT file used for comment wording "
                         "(default: the bundled 2022 reference next to this script)")
    args = ap.parse_args(argv)

    if not args.output and not args.check:
        base, ext = os.path.splitext(args.input)
        args.output = f"{base}_2022{ext or '.mct'}"

    with open(args.input, "r", encoding="utf-8", errors="replace", newline="") as fh:
        text = fh.read()

    # Detect the source version so the user knows what they are converting.
    mv = re.search(r"^\*VERSION\s*\n\s*([0-9.]+)", text, re.M)
    src_ver = mv.group(1) if mv else "?"
    print(f"Input file      : {args.input}")
    print(f"Detected version: {src_ver}")
    if src_ver == VERSION_2022:
        print("note: this file already reports Civil 2022 (9.1.0); the rules below "
              "should all be no-ops.")
    elif src_ver not in ("?", VERSION_2025):
        print(f"note: version {src_ver} is neither {VERSION_2025} nor {VERSION_2022}. "
              "Rules are written for 9.6.0 -> 9.1.0; review the report carefully.")

    prof_path = args.comment_profile
    if prof_path is None:
        here = os.path.dirname(os.path.abspath(__file__))
        cand = os.path.join(os.path.dirname(here), "2022")
        prof_path = cand if os.path.isfile(cand) else None
    profile = load_comment_profile(prof_path) if prof_path and os.path.isfile(prof_path) else None
    if profile is None and not args.no_sync_comments:
        print("note: no Civil 2022 reference available; comment headers left as-is.")

    rep = Report()
    rep.note(f"Source *VERSION = {src_ver}; output *VERSION = {VERSION_2022}")
    result = convert(text, rep, profile, sync_hdr=not args.no_sync_comments)

    print(rep.text())

    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            fh.write(rep.text())
        print(f"Report written to {args.report}")

    if args.check:
        print("--check given: no output written.")
        return 0

    with open(args.output, "w", encoding="utf-8", newline="") as fh:
        fh.write(result)
    print(f"Converted file written to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
