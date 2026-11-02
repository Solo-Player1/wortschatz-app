# Games spec (v2) — how to write a game for Wortschatz

The app (vanilla ES modules, no bundler, Capacitor Android WebView, RTL Egyptian-Arabic UI) has a shared game engine.
A game is ONE file `www/js/games/<id>.js` exporting `meta` and `start(g)`. The registry `www/js/games/index.js`
already lists all ids and lazy-loads them — **do not edit index.js**. Route: `#/game/<id>` (intro screen with pool
picker → play → results). Hub: `#/games`.

Read these files completely before coding (they are the API):
- `www/js/games/engine.js` — game shell + context `g` (hearts, score/combo, feedback, timers, results, pool API).
- `www/js/games/rounds.js` — ready-made question types: `askType`, `askChoice`, `askTiles`, `typeBox`, `choiceGrid`,
  `tilesBoard`, `tilesMatch`.
- `www/js/games/listen-write.js` — the reference game (copy its style).
- `www/css/games.css` — existing `gm-*` styles (reuse them). **Do not edit games.css** (several people write games
  at the same time). Game-specific CSS goes INSIDE your game file: `import { injectCss } from './engine.js';` and
  call `injectCss('<id>', \`...css...\`)` at the top of `start(g)`; classes prefixed `gm-<id>-`; tokens only
  (`var(--blue)`, `var(--surface)`, `var(--good)`, `var(--bad)`, `var(--der)`/`--die`/`--das` …), both themes.
- `www/js/content.js` (CONTENT, sentences/wfragen/verbs/alphabet helpers, `deNumber(n)`, `numberForms(n)`, `PERSONS`,
  `tilesOf`), `www/js/data.js` (DATA.words: `{id, de, ar, k: noun|verb|word|phrase, art, sg, pl, file, lessons}`,
  `displayDe(w)`, `pluralOf(w)`), `www/js/exercises.js` (`normDe`, `fold`, `shuffle`, `wrongPlurals`).
- `CONTENT_SPEC.md` — shape of sentences (`de`, `ar`, `alts`, `cloze {word, opts}`), wfragen (`q` with `___`,
  `answer`, `opts`, `ar`, `reply`), verbs (`inf`, `ar`, `forms {ich,du,er,wir,ihr,sie}`, `type`), alphabet
  (`letters [{ch,name,say,word}]`, `spelling [{word,spelled}]`). Content files are being written right now by other
  people; until `www/data/content.json` has data, test with your own small fixture (see Testing).

## `meta`
```js
export const meta = {
  id: 'articles',                // = file name
  title: 'der die das بسرعة',    // Egyptian Arabic (German in it is fine)
  icon: '🎯',
  short: 'اختار الأداة قبل الوقت ما يخلص',   // ≤ 40 chars, shown on the hub card
  desc: 'one Arabic sentence for the intro screen',
  how: ['bullet 1', 'bullet 2'],  // 2–3 short Arabic rules
  hearts: 3,                     // 0 = no hearts
  clock: 60,                     // optional: whole-game seconds (only shown on intro; you start it with g.clock())
  kinds: ['noun'], needAudio: false, minItems: 4, unit: 'كلمة',
  count: pool => pool.words({ kinds: ['noun'] }).length,   // optional: how many items this game can use for the selected pool (default = words of `kinds`)
};
```
## `start(g)` — the context
- Pool (already filtered by the user's choice: one lesson / what he studied / all lessons 1–15):
  `g.words({kinds, needAudio, min})`, `g.sentences({min, cloze})`, `g.wfragen({min})`, `g.verbs({min})`,
  `g.letters()`, `g.spelling()`, `g.maxLesson()`; `g.lesson` (number or null), `g.params` (hash params).
- Flow: build your rounds, render into `g.stage`, then call `await g.correct({...})` or `await g.wrong({...})`;
  both return `Promise<boolean>` — `true` = continue with the next round, `false` = game over (stop!).
  `g.correct({ points=10, wordId, typed, itemId, msg, quiet })` — score × combo multiplier, records progress:
  pass `wordId` + `typed:true` when the learner TYPED a word correctly (this feeds the lesson's ✍️ star), `itemId`
  for sentences/wfragen/verb items (feeds the 🧱 star).
  `g.wrong({ wordId, typed, itemId, correctHtml, label, msg, wait=true, cost=1 })` — loses a heart, shows the
  correct answer in the bottom strip; with `wait:true` waits for «متابعة» (use `wait:false` in speed games).
  When the last heart is gone the engine ends the game automatically.
- `g.end({ win })` — finish (e.g. all rounds done → `win:true`). Results/XP/high score are handled by the engine.
- Helpers: `g.setProgress(done,total)`, `g.timer(sec, onTimeout)` (per round, returns `{stop(), elapsed}` — time is
  counted per tick and pauses while the app is hidden or a confirm() blocks; use `elapsed` (s) for speed bonuses),
  `g.clock(sec, {onEnd})` (whole game), `g.after(ms,fn)`, `g.every(ms,fn)`, `g.clear(t)`, `g.on(el,ev,fn)`,
  `g.onCleanup(fn)`, `g.say(wordOrText)` (DW mp3 for a word with `file`, otherwise German TTS),
  `g.checkTyped(expected|[...], typed)` → `{ok, almost}`, `g.expectedFor(word)` → `{show, accept}` (nouns need the
  article; "das Büro, die Büros" — what the DW recording says — is accepted too), `g.wordHtml(w)` (coloured article
  markup), `g.shuffle`, `g.esc`, `g.el(html)`, `g.sfx.*`, `g.alive`.
- Wrong options must never be a correct answer: use `sameWord(a, b)` / `sameMeaning(ar1, ar2)` from `exercises.js`
  (near-identical Arabic, «أب» = «بابا، أبي», Papa = Vater, Hallo = Hi = Hey, Keine Ahnung = Ich weiß es nicht) when
  picking distractors. `g.say()` stores its promise in `g.lastSpeech` (askTiles waits for the latest reading).
- NEVER use bare `setTimeout`/`setInterval`/`addEventListener` on document/window — use `g.after/g.every/g.on` so
  everything is cleaned up when the user leaves. Never throw: if the pool is too small, `g.end({ win: true })`.

## UX rules
Mobile first (360–390 px wide), tap targets ≥ 48 px, no horizontal overflow, light + dark theme, all text Egyptian
Arabic, German always inside `<bdi class="de">`. German input: use `typeBox` (umlaut buttons). Every game must be
winnable (finite rounds, typically 10–20, or a clock) and must show the correct answer after a mistake. Speed games:
`wait:false` and short feedback. Keep it fun: combo, sounds and hearts are already provided by the engine.

## Testing (mandatory)
Copy the app to a scratch folder (`cp -r /d/wortschatz-app/www <scratch>/www`), never test inside the real `www`.
If `www/data/content.json` has no sentences yet, write a small fixture `content.json` into your scratch copy with
3–5 correct sentences/wfragen/verbs/letters in the documented shape. Serve with
`python -m http.server <port> -d <scratch>/www` and drive headless Edge over CDP — a ready-made driver is at
`C:/Users/abdel/AppData/Local/Temp/claude/d-----------------------/7779f6a5-04de-4420-acf0-30ebee72ccb4/scratchpad/cdp.mjs`
(`launch({port,width,height,dark})` → `goto(url)`, `hash(h)`, `evaluate(js)`, `shot(file)`, `errors[]`; use a
UNIQUE debugging port per run, e.g. 95xx). For each game: open `#/game/<id>`, start, play several rounds right AND
wrong programmatically, reach both the win and the lose screen, check zero console errors / exceptions, no
horizontal overflow at 360 and 390, and take light + dark screenshots (look at them!). When everything passes, copy
ONLY your game files `www/js/games/<id>.js` into the real project (nothing else).
