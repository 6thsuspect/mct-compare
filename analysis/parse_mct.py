#!/usr/bin/env python3
"""Parse a MIDAS Civil MCT file into ordered blocks."""
import re, sys, json
from collections import OrderedDict

def parse(path):
    blocks = OrderedDict()          # key -> list of raw lines (after header line)
    header = []                     # lines before first *BLOCK
    cur = None
    order = []
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        for raw in f:
            line = raw.rstrip('\n').rstrip('\r')
            m = re.match(r'^\*([A-Za-z0-9 ,&_\-]+?)\s*(?:;.*)?$', line)
            if line.startswith('*') and m:
                key = m.group(1).strip()
                # normalize "*USE-STLD, Girder Weight" -> keep arg
                cur = key
                if cur not in blocks:
                    blocks[cur] = []
                    order.append(cur)
                continue
            if cur is None:
                header.append(line)
            else:
                blocks[cur].append(line)
    return header, blocks, order

def split_lines(lines):
    """Separate comment/format lines from data lines."""
    comments, data = [], []
    for ln in lines:
        s = ln.strip()
        if s == '':
            continue
        if s.startswith(';'):
            comments.append(ln)
        else:
            data.append(ln)
    return comments, data

if __name__ == '__main__':
    p = sys.argv[1]
    h, b, o = parse(p)
    print(f"{p}: {len(o)} blocks")
    for k in o:
        c, d = split_lines(b[k])
        print(f"  {k:45s} comments={len(c):4d} data={len(d):5d}")
