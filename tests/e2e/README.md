# End-to-end tests (headless Edge)

The tests drive the real `www/` in headless Microsoft Edge over the DevTools protocol (`cdp.mjs`, Node 24, no npm
packages). Native plugins (notifications, filesystem, share, TTS) are mocked inside the page.

```bash
# 1) serve www/ on 127.0.0.1:8131 (keep it running in its own terminal)
python tests/e2e/serve.py 8131

# 2) run everything (~35 min) — per suite: its FAIL lines + one summary line; a crash/timeout is reported
bash tests/e2e/run_all.sh
```

| file | what it checks |
|---|---|
| `t_flow.mjs` | study session, lesson page, home mission |
| `t_plan.mjs` | 📅 study plan: home card quota, mission follows it, quota met → done, settings date/switch, overdue state, 390 light + 360 dark |
| `t_grading.mjs` | typed answers in games/exam/online for DW notations: `auf\|stehen`, `mein(e)`, `euer/eure`, `die Eltern (Plural)`, `etwas sagen` |
| `t_lessons.mjs` | every lesson page 1–76 with its cards opened (title, words + Arabic-letter pronunciation, sentences, grammar, episode teaser, no sideways overflow, every grammar table fits its card) + references: verbs (default = up to your lesson, «كل الأفعال», search: ä/ae, Arabic prefixes, DW gloss, «ich stehe auf»), question words, grammar — 390 light + 360 dark |
| `t_features.mjs` | 1.8: Android back button (mocked Capacitor App plugin: lesson→lessons→home→minimize, video→lesson, game ✕, passage steps), 📖 reading (word quiz repeats mistakes, text, write, Gemini grade with a mocked API, bad-key message), the Gemini key in settings (device-only, not in backups), 🧩 the 8 grammar topics (pages + quiz) |
| `t_exam.mjs <lesson>` | lesson exam solved correctly → passed; 3 wrong → the LOSE card (not just a text match); sentence drill → ⭐3 — run_all does lessons 1 7 9 14 16 40 76 |
| `t_notify.mjs` | hourly reminders 10–22 for 7 days, permission asked by the app itself, silenced when the mission / 📅 quota is done |
| `t_monkey.mjs` | every game at 390 light / 360 dark: reaches results, no overflow, no console errors |
| `t_integ.mjs` | videos + settings update card (label `1.<WEB_BUILD>`). Its only expected FAIL is the mocked `_capacitor_file_` video URL, which a desktop browser can't load |
| `t_fixes2.mjs` | regressions found by the night reviews (synonyms, tiles lock, backup in the APK, reminder taps, permission denied, grammar tables at 360 px, «إيه السؤال؟» never offers a second valid question — lessons 5–71 …) |
| `t_latch.mjs` | review mission stays done after a mistake in the same game |
| `t_update.mjs` | in-app update banner → web update / APK install / up to date, manifests built from `www/js/version.js` |

Each test uses its own debugging port (93xx–94xx), so they must not run twice at the same time.
Screenshots land in `shots/`.
