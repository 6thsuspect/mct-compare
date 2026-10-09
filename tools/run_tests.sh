set -u
P=0; F=0
chk(){ if [ "$1" = "$2" ]; then echo ">>> PASS: $3"; P=$((P+1)); else echo ">>> FAIL: $3"; F=$((F+1)); fi; }
eq(){ if diff -q "$1" "$2" >/dev/null; then chk a a "$3"; else chk a b "$3"; diff "$1" "$2" | head -8; fi; }

echo "=== T1 round-trip: convert(2025) == genuine 2022 ==="
python3 tools/mct_downgrade.py 2025 -o out/roundtrip.mct >/dev/null 2>&1
eq 2022 out/roundtrip.mct "byte-identical to real Civil 2022 export"

echo; echo "=== T2 idempotency: convert(2022) == 2022 ==="
python3 tools/mct_downgrade.py 2022 -o out/idem.mct > out/idem.log 2>&1
eq 2022 out/idem.mct "already-2022 file left untouched"
echo "   changes reported on a 2022 file:"; grep -c '^\s\+[0-9]\+\s' out/idem.log || true
grep -A6 'Changes applied' out/idem.log | head -8
echo "   warnings:"; grep -c '^  ! ' out/idem.log || true

echo; echo "=== T3 double conversion stability ==="
python3 tools/mct_downgrade.py out/roundtrip.mct -o out/double.mct >/dev/null 2>&1
eq out/roundtrip.mct out/double.mct "convert(convert(x)) == convert(x)"

echo; echo "TOTAL: pass=$P fail=$F"
