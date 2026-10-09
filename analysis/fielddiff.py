#!/usr/bin/env python3
"""Field-by-field comparison of data lines in a block."""
import sys
sys.path.insert(0, '/home/user/mct-compare/analysis')
from parse_mct import parse, split_lines
from collections import Counter

h1,b1,o1 = parse('/home/user/mct-compare/2022')
h2,b2,o2 = parse('/home/user/mct-compare/2025')
k = sys.argv[1]
c1,d1 = split_lines(b1[k]); c2,d2 = split_lines(b2[k])
assert len(d1)==len(d2), (len(d1),len(d2))

f1=[l.split(',') for l in d1]
f2=[l.split(',') for l in d2]
nf1=Counter(len(x) for x in f1); nf2=Counter(len(x) for x in f2)
print(f"BLOCK {k}: {len(d1)} data lines")
print(f"  field-count 2022: {dict(nf1)}")
print(f"  field-count 2025: {dict(nf2)}")

maxn=max(max(nf1),max(nf2))
print("  per-field differences (index: 2022val -> 2025val : count):")
any_d=False
for i in range(maxn):
    c=Counter()
    for a,b in zip(f1,f2):
        va=a[i].strip() if i<len(a) else '<MISSING>'
        vb=b[i].strip() if i<len(b) else '<MISSING>'
        if va!=vb: c[(va,vb)]+=1
    if c:
        any_d=True
        print(f"    field[{i}]: {len(c)} distinct change(s), {sum(c.values())} line(s)")
        for (va,vb),n in c.most_common(8):
            print(f"        {n:6d}x   '{va}'  ->  '{vb}'")
        if len(c)>8: print(f"        ... and {len(c)-8} more")
if not any_d: print("    (no field-level differences)")
