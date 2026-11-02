// الحالة المحفوظة على الجهاز (localStorage)
const KEY = 'ws:v1';

const DEFAULTS = () => ({
  version: 1,
  settings: {
    theme: 'system', dailyGoal: 20, newPerSession: 8, typing: true, autoplay: true, name: '', videoSub: true,
    missionMode: 'lesson', notify: true, notifyStart: 10, notifyEnd: 22, gameSounds: true,
  },
  progress: {},                                          // الكلمات: صناديق المراجعة + typed (كتبتها صح كام مرة)
  items: {},                                             // الجمل وأسئلة الاستفهام والتصريف: id → {ok, bad, last}
  exams: {},                                             // امتحانات الدروس: n → {passed, best, tries, crown, …}
  games: {},                                             // الألعاب: id → {best, plays, wins, last}
  days: {},
  streak: { current: 0, best: 0, lastDay: '' },
  xp: 0,
  lastSession: null,
  videos: {},                                            // الحلقات المحفوظة على التليفون: n → {uri, bytes, date}
  updates: { lastCheck: 0, available: null, dismissed: 0 },
});

// حاجات خاصة بالتليفون نفسه — ما تتنقلش في النسخة الاحتياطية
const DEVICE_KEYS = ['videos', 'updates'];

const pad = n => String(n).padStart(2, '0');

export function today(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// رقم اليوم بالتوقيت المحلي (عشان الفروق بين الأيام تطلع مظبوطة)
export function dayIndex(dateStr) {
  const [y, m, d] = (dateStr || today()).split('-').map(Number);
  return Math.round(new Date(y, m - 1, d).getTime() / 86400000 + 0.1);
}
export const todayIndex = () => dayIndex(today());

export function dateFromIndex(idx) {
  const d = new Date(1970, 0, 1);
  d.setDate(d.getDate() + idx);
  return today(d);
}

function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k of Object.keys(base)) {
    if (k in extra) base[k] = (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && (k === 'settings' || k === 'updates'))
      ? { ...base[k], ...extra[k] } : extra[k];
  }
  return base;
}

export const store = {
  state: DEFAULTS(),

  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = merge(DEFAULTS(), JSON.parse(raw));
    } catch (e) { this.state = DEFAULTS(); }
    return this.state;
  },

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* مساحة ممتلئة أو خاص */ }
  },

  // الفيديوهات المحفوظة فعلاً على التليفون بتفضل زي ما هي
  reset() { const videos = this.state.videos; this.state = DEFAULTS(); if (videos) this.state.videos = videos; this.save(); },

  touchDay() {
    const t = today();
    if (!this.state.days[t]) this.state.days[t] = { done: 0, xp: 0, sessions: 0, new: 0 };
    return this.state.days[t];
  },

  // بيتنادى لما جلسة / لعبة / امتحان / تدريب يخلص (عدّاد الجلسات نفسه في session.js)
  bumpStreak() {
    const s = this.state.streak, t = today();
    if (s.lastDay === t) return s;
    const yesterday = dateFromIndex(todayIndex() - 1);
    s.current = (s.lastDay === yesterday) ? s.current + 1 : 1;
    s.best = Math.max(s.best, s.current);
    s.lastDay = t;
    this.touchDay();
    this.save();
    return s;
  },

  // لو فات يوم من غير مذاكرة الستريك بيتصفر لما نفتح الأبلكيشن
  refreshStreak() {
    const s = this.state.streak;
    if (!s.lastDay) return s;
    const gap = todayIndex() - dayIndex(s.lastDay);
    if (gap > 1) { s.current = 0; this.save(); }
    return s;
  },

  exportJSON() {
    const state = { ...this.state };
    for (const k of DEVICE_KEYS) delete state[k];
    return JSON.stringify({ app: 'wortschatz', exported: new Date().toISOString(), state }, null, 1);
  },

  importJSON(str) {
    try {
      const j = JSON.parse(str);
      const st = j && j.app === 'wortschatz' && j.state ? j.state : j;
      if (!st || typeof st !== 'object' || !st.progress) return false;
      const local = {};
      for (const k of DEVICE_KEYS) local[k] = this.state[k];
      this.state = merge(DEFAULTS(), st);
      for (const k of DEVICE_KEYS) if (local[k]) this.state[k] = local[k];
      this.save();
      return true;
    } catch (e) { return false; }
  },
};
