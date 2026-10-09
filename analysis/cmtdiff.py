#!/usr/bin/env python3
import sys, difflib
sys.path.insert(0, '/home/user/mct-compare/analysis')
from parse_mct import parse, split_lines
h1,b1,o1 = parse('/home/user/mct-compare/2022')
h2,b2,o2 = parse('/home/user/mct-compare/2025')
for k in sys.argv[1:]:
    c1,_=split_lines(b1[k]); c2,_=split_lines(b2[k])
    print(f"\n===== {k} comment diff =====")
    for l in difflib.unified_diff(c1,c2,'2022','2025',lineterm='',n=1):
        print(l)
