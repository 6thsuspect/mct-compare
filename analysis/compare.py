#!/usr/bin/env python3
import sys, difflib
sys.path.insert(0, '/home/user/mct-compare/analysis')
from parse_mct import parse, split_lines

h1, b1, o1 = parse('/home/user/mct-compare/2022')
h2, b2, o2 = parse('/home/user/mct-compare/2025')

print("### HEADER DIFF ###")
for l in difflib.unified_diff(h1, h2, '2022', '2025', lineterm='', n=0):
    print(l)

print("\n### PER-BLOCK DIFF STATS ###")
print(f"{'BLOCK':38s} {'cmtDiff':>8s} {'dataDiff':>9s}")
for k in o1:
    c1,d1 = split_lines(b1[k]); c2,d2 = split_lines(b2.get(k,[]))
    cd = sum(1 for l in difflib.unified_diff(c1,c2,lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('---','+++'))
    dd = sum(1 for l in difflib.unified_diff(d1,d2,lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('---','+++'))
    flag = '  <<<' if (cd or dd) else ''
    print(f"{k:38s} {cd:8d} {dd:9d}{flag}")
