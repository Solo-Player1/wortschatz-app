#!/bin/bash
# Full QA run against http://127.0.0.1:8131 (python tests/e2e/serve.py 8131 on D:/wortschatz-app/www) — ≈35 min.
# Every suite prints its FAIL lines + one summary line. A suite that crashes or hits its timeout before printing
# results is reported as such (never an empty section).
cd "$(dirname "$0")"

# run <title> <timeout-s> <command…>
run() {
  local title="$1" t="$2"; shift 2
  echo "== $title"
  local out code
  out=$(timeout "$t" "$@" 2>&1); code=$?
  # FAIL lines (+ the indented message lines node unit tests print under them); the mocked native video URL can't
  # load in a desktop browser (t_integ's one expected FAIL)
  echo "$out" | awk '/^ *FAIL/{print; f=1; next} f && /^       /{print; next} {f=0}' | grep -v "_capacitor_file_"
  local sum; sum=$(echo "$out" | grep -E "[0-9]+ passed|passed, [0-9]+ failed|^t_[a-z0-9]+: [0-9]+/[0-9]+ passed|^ALL PASS|^SOME FAILED" | tail -1)
  local np nf; np=$(echo "$out" | grep -cE "^ *(PASS|ok) "); nf=$(echo "$out" | grep -cE "^ *FAIL")
  if [ -n "$sum" ]; then echo "$sum"
  elif [ $((np + nf)) -gt 0 ]; then echo "pass: $np, fail: $nf"
  fi
  if [ -z "$sum" ] && [ $((np + nf)) -eq 0 ] || [ "$code" -eq 124 ]; then
    echo "!! no results or timed out (exit $code) — last lines:"; echo "$out" | tail -8 | sed 's/^/   /'
  fi
}

ROOT=/d/wortschatz-app
run "engine unit tests" 400 node "$ROOT/tests/engine.test.mjs"
run "plan unit tests" 60 node "$ROOT/tests/plan.test.mjs"
run "grading unit tests (DW notations)" 60 node "$ROOT/tests/grading.test.mjs"
run "grading in games/exam/online" 120 node t_grading.mjs
run "study plan (home card, mission, settings)" 200 node t_plan.mjs
run "every lesson page 1-76 + references (verbs scope/search, question words, grammar)" 600 node t_lessons.mjs
run "1.8 features: back button, reading + Gemini (mocked), Gemini key, grammar topics" 300 node t_features.mjs
run "integration (video/update) — its only expected FAIL is the mocked native video URL" 200 node t_integ.mjs
run "study flow" 300 node t_flow.mjs
for L in 1 7 9 14 16 40 76; do run "exam+drill L$L (9 checks)" 400 node t_exam.mjs $L; done
run "notifications" 150 node t_notify.mjs
run "monkey all games" 900 node t_monkey.mjs
run "review-2 fixes" 300 node t_fixes2.mjs
run "review-3 latch" 200 node t_latch.mjs
run "in-app update" 200 node t_update.mjs
