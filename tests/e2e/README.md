# End-to-end tests (headless Edge)

The tests drive the real `www/` in headless Microsoft Edge over the DevTools protocol (`cdp.mjs`, Node 24, no npm
packages). Native plugins (notifications, filesystem, share, TTS) are mocked inside the page.

```bash
# 1) serve www/ on 127.0.0.1:8131 (keep it running in its own terminal)
python tests/e2e/serve.py 8131

# 2) run everything (~20 min) — prints one summary line per suite
bash tests/e2e/run_all.sh
```

| file | what it checks |
|---|---|
| `t_flow.mjs` | study session, lesson page, home mission |
| `t_exam.mjs <lesson>` | lesson exam solved correctly → passed; 3 wrong → lost; sentence drill → ⭐3 |
| `t_notify.mjs` | hourly reminders 10–22 for 7 days, silenced when the mission is done, switch off |
| `t_monkey.mjs` | every game at 390 light / 360 dark: reaches results, no overflow, no console errors |
| `t_integ.mjs` | videos + update banner (web and mocked native). Its only expected FAIL is the mocked `_capacitor_file_` video URL, which a desktop browser can't load |
| `t_fixes2.mjs` | regressions found by the night reviews (synonyms, tiles lock, backup in the APK, reminder taps, overflow at 360 px …) |
| `t_latch.mjs` | review mission stays done after a mistake in the same game |

Each test uses its own debugging port (93xx–94xx), so they must not run twice at the same time.
Screenshots land in `shots/`.
