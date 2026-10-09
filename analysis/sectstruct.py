#!/usr/bin/env python3
import sys
sys.path.insert(0,'/home/user/mct-compare/analysis')
from parse_mct import parse, split_lines
from collections import Counter
h,b,o=parse(sys.argv[1])
for blk in ['SECTION']:
    c,d=split_lines(b[blk])
    print(f"--- {sys.argv[1]} {blk}: field[1] value histogram ---")
    for v,n in Counter(x[1].strip() for x in (l.split(',') for l in d)).most_common():
        print(f"   {n:5d}  '{v}'")
    print(f"--- first 14 data lines with index ---")
    for i,l in enumerate(d[:14]):
        print(f"{i:4d}| {l}")
