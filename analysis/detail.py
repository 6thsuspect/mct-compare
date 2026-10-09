#!/usr/bin/env python3
import sys, difflib
sys.path.insert(0, '/home/user/mct-compare/analysis')
from parse_mct import parse, split_lines
h1,b1,o1 = parse('/home/user/mct-compare/2022')
h2,b2,o2 = parse('/home/user/mct-compare/2025')
for k in sys.argv[1:]:
    print(f"\n{'='*90}\nBLOCK: {k}\n{'='*90}")
    c1,d1 = split_lines(b1[k]); c2,d2 = split_lines(b2[k])
    print("--- COMMENTS 2022 ---")
    for l in c1: print(l)
    print("--- COMMENTS 2025 ---")
    for l in c2: print(l)
