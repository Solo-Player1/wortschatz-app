// gemini.js — تقييم فهم قطعة القراءة بـ Google Gemini.
// المفتاح على التليفون بس (localStorage «ws:gemini»، مش في state فمش بيتنقل في النسخة الاحتياطية) — مش جوه ملفات
// التطبيق، لأن الريبو وملفات التحديث على GitHub عامّة وأي حد كان هيقدر ياخده.
// Gemini دوره «يقيّم بس»: بيقارن اللي المتعلم كتبه بالعربي بالترجمة المرجعية ويطلّع نسبة + ملاحظات بالمصري.

const KEY_STORE = 'ws:gemini';
const API = 'https://generativelanguage.googleapis.com/v1beta/models/';
// أسرع موديل الأول (≈ ٢ ثانية)، ولو مش متاح نجرّب اللي بعده — جوجل بتشيل موديلات قديمة (2.5 اتشال للحسابات الجديدة)
const MODELS = [['gemini-flash-lite-latest', 30000], ['gemini-3.5-flash-lite', 30000], ['gemini-flash-latest', 60000]];

export function getGeminiKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; }
}
export function setGeminiKey(k) {
  try {
    const v = String(k || '').trim();
    if (v) localStorage.setItem(KEY_STORE, v); else localStorage.removeItem(KEY_STORE);
    return true;
  } catch (e) { return false; }
}
export const hasGeminiKey = () => !!getGeminiKey();

class GeminiError extends Error {
  constructor(code, msg) { super(msg); this.code = code; }
}
// رسالة بالمصري لكل نوع غلط
export function errorText(e) {
  switch (e && e.code) {
    case 'nokey': return 'لسه ما حطّيتش مفتاح Gemini — من الإعدادات ← 🤖 تصحيح القراءة';
    case 'badkey': return 'مفتاح Gemini مش شغّال — اتأكد إنك لزقته صح من Google AI Studio';
    case 'quota': return 'عدّيت الحد المجاني بتاع Gemini دلوقتي — جرّب كمان شوية';
    case 'network': return 'محتاج نت عشان Gemini يصحّح — اتأكد من الاتصال وجرّب تاني';
    case 'timeout': return 'Gemini اتأخر في الرد — جرّب تاني';
    case 'server': return 'Gemini عليه ضغط دلوقتي — جرّب كمان شوية';
    default: return 'Gemini رجّع رد مش مفهوم — جرّب تاني';
  }
}

async function post(model, key, body, timeoutMs) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
  const fail = e => new GeminiError(e && e.name === 'AbortError' ? 'timeout' : 'network', String(e && e.message || e));
  try {                                         // التايمر بيغطي الرد كله (الـ body كمان)، مش الهيدرز بس
    let r;
    try {
      r = await fetch(`${API}${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
    } catch (e) { throw fail(e); }
    if (r.ok) { try { return await r.json(); } catch (e) { throw e && e.name === 'AbortError' ? fail(e) : new GeminiError('bad', 'not json'); } }
    let msg = '';
    try { msg = ((await r.json()).error || {}).message || ''; } catch (e) { /* ignore */ }
    if (r.status === 400 && /api key|API_KEY|invalid.*key/i.test(msg)) throw new GeminiError('badkey', msg);
    if (r.status === 401 || r.status === 403) throw new GeminiError('badkey', msg);
    if (r.status === 429) throw new GeminiError('quota', msg);
    if (r.status === 404) throw new GeminiError('model', msg);              // الموديل اتشال → اللي بعده
    throw new GeminiError(r.status >= 500 ? 'server' : 'bad', `${r.status} ${msg}`);
  } finally { clearTimeout(timer); }
}

// بيجرّب الموديلات بالترتيب؛ غلط المفتاح/الحد/النت/الوقت بيوقف على طول (التاني مش هيفرق — والمستخدم مستني)
async function generate(body, key) {
  let last = null;
  for (const [model, ms] of MODELS) {
    try {
      const d = await post(model, key, body, ms);
      const text = (((d.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || '').join('') || '';
      if (!text) throw new GeminiError('bad', 'empty response');
      return { text, model: d.modelVersion || model };
    } catch (e) {
      last = e;
      if (['badkey', 'quota', 'network', 'nokey', 'timeout'].includes(e.code)) throw e;
    }
  }
  throw last || new GeminiError('bad', 'no model');
}

// فحص سريع للمفتاح (من الإعدادات)
export async function testGeminiKey(key = getGeminiKey()) {
  if (!key) throw new GeminiError('nokey', 'no key');
  const { model } = await generate({ contents: [{ role: 'user', parts: [{ text: 'Antworte nur mit: OK' }] }], generationConfig: { temperature: 0, maxOutputTokens: 8 } }, key);
  return model;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    score: { type: 'INTEGER' },
    understood: { type: 'ARRAY', items: { type: 'STRING' } },
    missed: { type: 'ARRAY', items: { type: 'OBJECT', properties: { de: { type: 'STRING' }, ar: { type: 'STRING' } }, required: ['de', 'ar'] } },
    wrong: { type: 'ARRAY', items: { type: 'OBJECT', properties: { de: { type: 'STRING' }, learner: { type: 'STRING' }, correct: { type: 'STRING' } }, required: ['de', 'learner', 'correct'] } },
    feedback: { type: 'STRING' },
  },
  required: ['score', 'understood', 'missed', 'wrong', 'feedback'],
};
const SYSTEM = 'أنت مدرس ألماني لطيف وصارم لمتعلمين مصريين في مستوى A1. دورك تقييم الفهم بس — ما تترجمش القطعة كلها. رد JSON بس.';

export function buildPrompt({ de, ref, answer }) {
  return `القطعة الألماني:
<<<${de}>>>

الترجمة المرجعية (الصح):
<<<${ref}>>>

اللي المتعلم كتبه بالعربي (فهمه للقطعة):
<<<${answer}>>>

قيّم فهمه للمعنى بس (مش أسلوبه في العربي): قسّم القطعة لمعلومات (مين، فين، إمتى، إيه اللي حصل، الأرقام، الوصف). score = نسبة المعلومات اللي فهمها صح من 0 لـ 100. المصري أو الفصحى أو الملخص بكلامه كله مقبول. المعلومة الغلط أوحش من الناقصة. فاضي أو مالوش علاقة → 0.
understood: نقط قصيرة بالمصري للي فهمه صح. missed: أهم اللي فاته (de = العبارة الألماني من القطعة، ar = معناها بالمصري)، 5 بالكتير. wrong: اللي فهمه غلط (de، learner = اللي كتبه، correct = الصح)، 5 بالكتير. feedback: سطرين بالمصري: تشجيع + نصيحة واحدة محددة.`;
}

// { score 0–100, understood[], missed[{de, ar}], wrong[{de, learner, correct}], feedback, model }
export async function evaluateReading({ de, ref, answer }) {
  const key = getGeminiKey();
  if (!key) throw new GeminiError('nokey', 'no key');
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: buildPrompt({ de, ref, answer }) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
  const { text, model } = await generate(body, key);
  let j;
  try { j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { throw new GeminiError('bad', 'not json'); }
  const arr = (x, n) => (Array.isArray(x) ? x : []).slice(0, n);
  const str = x => String(x == null ? '' : x).trim();
  const score = Math.max(0, Math.min(100, Math.round(Number(j.score))));
  if (!Number.isFinite(score)) throw new GeminiError('bad', 'no score');
  const wrongDe = new Set(arr(j.wrong, 5).map(w => str(w.de)));
  return {
    score,
    understood: arr(j.understood, 8).map(str).filter(Boolean),
    // نفس العبارة ما تطلعش في «فاتك» و«فهمتها غلط» مع بعض
    missed: arr(j.missed, 5).map(m => ({ de: str(m.de), ar: str(m.ar) })).filter(m => m.de && m.ar && !wrongDe.has(m.de)),
    wrong: arr(j.wrong, 5).map(w => ({ de: str(w.de), learner: str(w.learner), correct: str(w.correct) })).filter(w => w.de && w.correct),
    feedback: str(j.feedback),
    model,
  };
}
