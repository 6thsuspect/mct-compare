#!/usr/bin/env python3
import sys, difflib
sys.path.insert(0, '/home/user/mct-compare/analysis')
from parse_mct import parse, split_lines
h1,b1,o1 = parse('/home/user/mct-compare/2022')
h2,b2,o2 = parse('/home/user/mct-compare/2025')
k = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv)>2 else 60
c1,d1 = split_lines(b1[k]); c2,d2 = split_lines(b2[k])
out=[]
for l in difflib.unified_diff(d1,d2,'2022','2025',lineterm='',n=0):
    out.append(l)
print('\n'.join(out[:n]))
print(f"\n... total {len(out)} diff lines")
