# Content spec (v2) — sentences, question words, verbs, grammar notes

Binding contract for the content files of the Wortschatz app (German A1, DW "Nicos Weg" lessons **1–15 only** — never add
lesson 16+). Learners: two Egyptian adults (Arabic native speakers) preparing for German A1. App UI language: Egyptian
colloquial Arabic. All content here is **source data**: it lives in `D:/wortschatz-app/content/` and is merged into
`www/data/content.json` by `python tools/build_content.py` (written by the app developer, not by content authors).

## Golden rules
1. **German must be 100 % correct** standard German (spelling incl. ä ö ü ß, capitalisation of nouns, word order, verb
   endings, punctuation). A1 level, short and natural (3–9 words per sentence, max 12). No archaic or regional forms.
   Prefer the formulations DW uses in Nicos Weg.
2. **Vocabulary limit:** a sentence of lesson *n* may only use words from lessons ≤ *n* (see
   `www/data/lessons.json` → `lessons[].words` → `words[]`), plus this small A1 core that every lesson may use:
   personal pronouns (ich du er sie es wir ihr Sie, mich dich mir dir), possessives mein/dein/Ihr (+endings),
   articles der die das den dem ein eine einen kein keine, und aber oder nicht ja nein auch sehr gern(e) hier da
   jetzt heute, sein / haben / heißen / kommen / wohnen / sprechen in all present forms, in aus mit von zu für,
   numbers, names (Nico, Emma, Lisa, Max, Herr Müller, Frau Schneider …), country/city names (Deutschland, Spanien,
   Ägypten, Kairo, Berlin, Bonn, Köln …), bitte, danke. When in doubt, stay with the lesson's own words.
3. Every sentence should practise the **lesson's own words and grammar** (`lessons[].gram` and the episode). Mine the
   episode subtitles `www/data/subs/L<n>.vtt` (WebVTT, the real dialogue of the lesson video): at least ~40 % of the
   sentences should be taken verbatim or lightly shortened from the episode when they fit A1 and the vocabulary rule.
4. **Arabic** = natural Egyptian colloquial, short, the way an Egyptian would really say it ("اسمك إيه؟",
   "أنا من مصر.", "إزيك؟"). Meaning must match the German exactly (formal Sie → mention «(رسمي)» when it matters).
5. Valid JSON, UTF-8, no comments, no trailing commas. Ids are stable and unique: sentences `s<NN>-<NNN>`
   (`s01-001`), question-word items `w<NN>-<NN>` (`w01-01`), grammar points `g<NN>-<N>`.

## File 1 — `content/L<NN>.json` (one per lesson, NN = 01…15)
```json
{
  "n": 1,
  "sentences": [
    {
      "id": "s01-001",
      "de": "Guten Morgen, Herr Müller!",
      "ar": "صباح الخير يا أستاذ مولر!",
      "kind": "statement",
      "focus": ["greeting"],
      "alts": [],
      "cloze": { "word": "Morgen", "opts": ["Morgen", "Abend", "Nacht"] },
      "src": "episode"
    }
  ],
  "wfragen": [
    {
      "id": "w01-01",
      "q": "___ heißt du?",
      "answer": "Wie",
      "opts": ["Wie", "Was", "Wo", "Woher"],
      "ar": "اسمك إيه؟",
      "reply": "Ich heiße Nico.",
      "reply_ar": "اسمي نيكو."
    }
  ],
  "grammar": [
    {
      "id": "g01-1",
      "h": "du ولا Sie؟",
      "body": "شرح قصير بالمصري (٢–٥ سطور): إمتى نستخدم ده، وإزاي.",
      "examples": [ { "de": "Wie heißt du?", "ar": "اسمك إيه؟ (لصاحبك)" }, { "de": "Wie heißen Sie?", "ar": "حضرتك اسمك إيه؟ (رسمي)" } ],
      "table": [["", "du", "Sie"], ["heißen", "heißt", "heißen"]]
    }
  ]
}
```
### sentences (target 18–22 per lesson; lesson 3 may have ~12; never fewer than 10)
- `de`: the sentence. The app builds **word tiles by splitting `de` on single spaces**, punctuation stays glued to its
  word. So: single spaces only, no double spaces, no spaces before punctuation. A learner must be able to rebuild the
  sentence from shuffled tiles → avoid sentences whose words could be ordered in another *equally correct* way, or
  list every other correct order in `alts` (full sentences with the same tiles, e.g. `"Heute bin ich müde."` for
  `"Ich bin heute müde."`). Mix statements, questions and short answers.
- `kind`: `"statement" | "question" | "answer" | "greeting"`.
- `focus`: 1–3 short English tags: `greeting, introduce, origin, w-frage, verb:<infinitive>, article, plural, number,
  spelling, polite, negation, address, phone, drink, food, order` …
- `alts`: optional, see above (empty array if none).
- `cloze`: optional but give it for **at least 60 %** of the sentences: `word` = one tile of `de` **exactly as written
  in the sentence but without its glued punctuation** (e.g. `"Morgen"` for the tile `"Morgen,"`); `opts` = 3 or 4
  choices including `word`, the wrong ones plausible for a learner but clearly wrong in this sentence (wrong verb
  ending, wrong article, wrong question word, another lesson word). Exactly one option may fit.
  Optional `accept`: other words that are just as correct when the learner TYPES the gap (cloze game, second half),
  e.g. `"Danke ___!"` with `word: "schön"` → `"accept": ["sehr"]`. Never put them in `opts`. (gern ↔ gerne is built in.)
- `src`: `"episode"` (from the subtitles) or `"authored"`.
### wfragen (question-word drill; 3–8 per lesson where natural; lesson 11 "أدوات الاستفهام" 10–14)
- `q` contains `___` exactly once where the question word goes (sentence-initial question word is capitalised in
  `answer`). `opts` 4 different question words (Wie, Was, Wo, Woher, Wer, Wann, Wie alt, Wie viel, Welche, Wohin…
  only ones that make sense at A1), exactly one correct. `reply` = a short natural answer (optional but preferred).
### grammar (2–4 points per lesson)
- Short, practical, Egyptian Arabic explanation of the lesson's grammar/communication goal (see `lessons[].gram`,
  `lessons[].goal`, the DW lesson pages cached in `tools/cache/L<id>.html`, and Abdullah's guides in
  `www/lib/guide-nicos-6-15.html` / `www/lib/guide-articles-plural.html`). `body` ≤ 450 characters. `examples` 2–4.
  `table` optional (array of rows, first row = header) for conjugations, articles, numbers.

## File 2 — `content/verbs.json`
```json
{
  "verbs": [
    {
      "inf": "heißen",
      "ar": "اسمه / يتسمّى",
      "lesson": 1,
      "type": "irregular",
      "forms": { "ich": "heiße", "du": "heißt", "er": "heißt", "wir": "heißen", "ihr": "heißt", "sie": "heißen" },
      "note": "ملحوظة قصيرة بالمصري لو فيه حاجة شاذة (مثلاً: e بتبقى i مع du و er).",
      "examples": [ { "de": "Ich heiße Emma.", "ar": "اسمي إيما." }, { "de": "Wie heißt du?", "ar": "اسمك إيه؟" } ]
    }
  ]
}
```
- One entry for every verb that appears in lessons 1–15 (all `k:"verb"` words of `lessons.json` — strip markers like
  `(etwas)` / `etwas` / `jemanden`), plus verbs that the lessons' phrases and dialogues obviously need: sein, haben,
  heißen, kommen, wohnen, sprechen, möchten (ich möchte …), and any other present-tense verb used in the lessons'
  phrases (check every `k:"phrase"` word). `lesson` = first lesson where the learner meets it.
- `forms` = **Präsens** for ich / du / er (= er, sie, es) / wir / ihr / sie (= sie, Sie). Separable verbs: write the
  conjugated form with the particle at the end as it appears in a main clause, e.g. `"ich": "rufe … an"`, and set
  `"type": "separable"`. `type`: `regular | irregular | modal | separable | mixed`.
- `examples`: 1–2 short sentences obeying the vocabulary rule of `lesson`.

## File 3 — `content/wwords.json`
```json
{ "wwords": [ { "w": "Wie", "ar": "إزاي / إيه", "lesson": 1, "use": "بنسأل بيها عن الاسم والحال والطريقة", "examples": [ { "de": "Wie heißt du?", "ar": "اسمك إيه؟" } ] } ] }
```
Every question word the learner meets in lessons 1–15 (incl. multi-word ones like "Wie alt", "Wie viel", "Woher"),
`lesson` = first lesson, 1–3 examples each.

## Self-check before finishing (mandatory)
Write a tiny Python validator in your scratch folder (not in the project) and run it on your files: JSON parses; ids
unique and well-formed; every `cloze.word` is one of the tiles of `de` (punctuation stripped); `opts` contain the
answer exactly once and have no duplicates; `q` contains `___` once; no double spaces; every sentence ends with
`. ! ?`; then **re-read every German sentence once more as a strict German teacher** and fix anything doubtful.
