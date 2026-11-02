#!/bin/bash
# Full QA run against http://127.0.0.1:8131 (python http.server on D:/wortschatz-app/www)
cd "$(dirname "$0")"
echo "== engine unit tests"; (cd /d/wortschatz-app && node tests/engine.test.mjs 2>&1 | tail -1)
echo "== integration (video/update)"; timeout 200 node t_integ.mjs 2>&1 | grep -E "FAIL|ALL PASS|SOME" | grep -v "_capacitor_file_"
echo "== study flow"; timeout 300 node t_flow.mjs 2>&1 | grep -E "FAIL|ALL PASS|SOME"
for L in 1 7 9 14; do echo "== exam+drill L$L"; timeout 400 node t_exam.mjs $L 2>&1 | grep -E "^(PASS|FAIL)" | grep -c PASS | sed 's/^/pass: /'; timeout 1 true; done
echo "== notifications"; timeout 150 node t_notify.mjs 2>&1 | grep -E "^(PASS|FAIL)" | sort | uniq -c | awk '{print $2}' | sort | uniq -c
echo "== monkey all games"; timeout 900 node t_monkey.mjs 2>&1 | grep -E "FAIL|ALL PASS|SOME"
echo "== review-2 fixes"; timeout 300 node t_fixes2.mjs 2>&1 | grep -E "^FAIL|ALL PASS|SOME"
echo "== review-3 latch"; timeout 200 node t_latch.mjs 2>&1 | grep -E "^FAIL|ALL PASS|SOME"
