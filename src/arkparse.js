// Ark's offline understanding: the common commands, worked out on the phone with no internet or key.
// Returns { say, actions } in the same shape the AI brain returns, or null if it didn't get it.

const SUBJ = [
  [/\b(maths?|mathematics)\b/i, 'm'],
  [/\b(physics|phy)\b/i, 'p'],
  [/\b(chem(istry)?)\b/i, 'c'],
];
export const subjOf = (s) => (SUBJ.find(([re]) => re.test(s)) || [])[1] || null;

const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, sixty: 60, ninety: 90, half: 0.5, an: 1, a: 1 };
const num = (s) => (s == null ? NaN : /^\d+(\.\d+)?$/.test(s) ? Number(s) : WORDNUM[s.toLowerCase()] ?? NaN);

const pad = (n) => String(n).padStart(2, '0');
export const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "9:40 pm", "7", "21:30", "7.30 am", "noon", "midnight", "half past 7"
export function parseClock(s) {
  s = s.toLowerCase().trim();
  if (/^noon$/.test(s)) return { h: 12, m: 0, ap: true };
  if (/^midnight$/.test(s)) return { h: 0, m: 0, ap: true };
  let m = s.match(/^half past (\d{1,2})$/);
  if (m) return { h: Number(m[1]), m: 30, ap: false };
  m = s.match(/^quarter past (\d{1,2})$/);
  if (m) return { h: Number(m[1]), m: 15, ap: false };
  m = s.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  const ap = m[3] ? m[3][0] : null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return { h, m: min, ap: !!ap || h > 12 || h === 0 };
}

// Next moment that clock time happens. Without AM/PM, "7" means whichever 7 comes next.
export function nextAt(clock, nowMs, dayWord = '') {
  const base = new Date(nowMs);
  const day = /tomorrow/.test(dayWord) ? 1 : /day after/.test(dayWord) ? 2 : 0;
  const mk = (h) => { const d = new Date(base); d.setDate(d.getDate() + day); d.setHours(h, clock.m, 0, 0); return d; };
  const tonight = /tonight|evening|night/.test(dayWord);
  const morning = /morning/.test(dayWord);
  if (clock.ap) {
    const d = mk(clock.h);
    if (!day && d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
    return d;
  }
  let h = clock.h % 12;
  if (tonight) h += 12;
  else if (morning) h += 0;
  else if (day) { if (h < 7) h += 12; } // "tomorrow at 5" means 5 PM; "tomorrow at 8" means 8 AM
  else {
    const am = mk(h), pm = mk(h + 12);
    if (am.getTime() > nowMs) return am;
    if (pm.getTime() > nowMs) return pm;
    am.setDate(am.getDate() + 1);
    return am;
  }
  const d = mk(h);
  if (!day && d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
  return d;
}

const DUR = /\bin\s+(\d+(?:\.\d+)?|an?|half an?|one|two|three|four|five|ten|fifteen|twenty|thirty|forty|fifty)\s*(min(?:ute)?s?|hrs?|hours?)\b/i;
const AT = /\b(?:at|by|@)\s+((?:\d{1,2}(?:[:.]\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)|noon|midnight|half past \d{1,2}|quarter past \d{1,2})/i;
const DAYW = /\b(tomorrow|day after tomorrow|tonight|this evening|in the morning|this morning|at night)\b/i;

function whenFrom(s, nowMs) {
  let m = s.match(DUR);
  if (m) {
    let n = /^half/i.test(m[1]) ? 0.5 : num(m[1]);
    if (/^h/i.test(m[2])) n *= 60;
    if (n > 0) return { at: new Date(nowMs + n * 60000), rest: s.replace(m[0], ' ') };
  }
  m = s.match(AT);
  if (m) {
    const c = parseClock(m[1]);
    if (c) {
      const dw = (s.match(DAYW) || [''])[0].toLowerCase();
      return { at: nextAt(c, nowMs, dw), rest: s.replace(m[0], ' ').replace(DAYW, ' ') };
    }
  }
  return null;
}

const clean = (t) => t.replace(/\s+/g, ' ').replace(/^(to|that|about|for)\s+/i, '').replace(/[.,!?\s]+$/, '').trim();
const say12 = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`);
export const whenWords = (d, nowMs) => {
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(nowMs).setHours(0, 0, 0, 0)) / 86400000);
  return `${days === 0 ? '' : days === 1 ? 'tomorrow ' : `${new Date(d).toLocaleDateString('en-IN', { weekday: 'long' })} `}at ${say12(new Date(d))}`;
};

export function parseOffline(input, ctx) {
  const nowMs = ctx.now;
  const s = input.trim().replace(/^(hey |ok |okay )?ark[,!]?\s*/i, '').replace(/\bplease\b/gi, '').trim();
  const low = s.toLowerCase();
  if (!s) return null;

  // reminders
  if (/^(remind|set (a )?reminder|reminder|alert me|ping me|wake me)/i.test(s)) {
    const w = whenFrom(s, nowMs);
    if (!w) return { say: 'When should I remind you? Say a time, like “at 9:40” or “in 20 minutes”.', actions: [] };
    let text = clean(w.rest.replace(/^(remind me|set (a )?reminder|reminder|alert me|ping me|wake me( up)?)\s*/i, '').replace(/\b(to|that)\s*$/i, ''));
    if (!text) text = 'Reminder';
    text = text[0].toUpperCase() + text.slice(1);
    return { say: `Done. I'll remind you ${whenWords(w.at, nowMs)}: ${text}.`, actions: [{ do: 'remind', text, at: localIso(w.at) }] };
  }

  // focus timer
  let m = low.match(/^(stop|end|cancel) (the )?(focus|timer|session|study)/);
  if (m) return { say: 'Stopping the timer.', actions: [{ do: 'stop_focus' }] };
  if (/^(start|begin|focus|study)\b/.test(low) && /(focus|timer|study|session|minutes|hour|pomodoro)/.test(low)) {
    m = low.match(/(\d+|an?|half an?|one|two|thirty|forty|fifty|twenty)\s*(min(?:ute)?s?|hrs?|hours?)/);
    let min = ctx.focusMinutes || 50;
    if (m) { min = /^half/.test(m[1]) ? 30 : num(m[1]) * (/^h/.test(m[2]) ? 60 : 1); }
    min = Math.max(5, Math.min(180, Math.round(min)));
    const subj = subjOf(low);
    const name = { m: 'Maths', p: 'Physics', c: 'Chemistry' }[subj] || '';
    return { say: `Starting ${min} minutes${name ? ` of ${name}` : ''}. Go.`, actions: [{ do: 'focus', minutes: min, subj, label: name || 'Focus' }] };
  }

  // potion
  if (/\b(drink|use|buy|take)\b.*\bpotion\b/.test(low)) return { say: 'Drinking a health potion.', actions: [{ do: 'potion' }] };

  // marks: "PT 14 mains maths 72 physics 58 chemistry 66"
  m = low.match(/\bpt[am]?[\s-]*(\d{1,2})\b/);
  if (m && /(math|phys|chem)/.test(low) && /\d{1,3}\D+\d{1,3}/.test(low)) {
    const kind = /\b(adv|advanced|pta)/.test(low) ? 'adv' : 'mains';
    const grab = (re) => { const x = low.match(re); return x ? Number(x[1]) : null; };
    const a = { do: 'marks', pt: Number(m[1]), kind, m: grab(/maths?\D{0,4}(-?\d{1,3})/), p: grab(/phys(?:ics)?\D{0,4}(-?\d{1,3})/), c: grab(/chem(?:istry)?\D{0,4}(-?\d{1,3})/) };
    return { say: `Logged PT-${a.pt} ${kind === 'adv' ? 'Advanced' : 'Mains'} marks.`, actions: [a] };
  }

  // add tasks
  m = s.match(/^(?:add|create|new|make)\s+(?:a\s+|an\s+)?(to-?do|task|daily|habit)\s*(?:called|named|:|-)?\s*(?:to\s+)?(.+)$/i)
    || s.match(/^(?:add|put)\s+(.+?)\s+(?:to|on|in)\s+(?:my\s+)?(to-?dos?|tasks?|dailies|daily|habits?)(?: list)?$/i);
  if (m) {
    let [type, text] = /^(to-?do|task|daily|habit)$/i.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    type = /habit/i.test(type) ? 'habit' : /dail/i.test(type) ? 'daily' : 'todo';
    let due = null;
    if (/\btomorrow\b/i.test(text)) { const d = new Date(nowMs); d.setDate(d.getDate() + 1); due = dateKey(d); text = text.replace(/\b(for |by |due )?tomorrow\b/i, ''); }
    else if (/\btoday\b/i.test(text)) { due = ctx.today; text = text.replace(/\b(for |by |due )?today\b/i, ''); }
    text = clean(text);
    if (!text) return null;
    text = text[0].toUpperCase() + text.slice(1);
    const label = type === 'todo' ? 'to-do' : type;
    return { say: `Added ${label}: ${text}.`, actions: [{ do: 'add_task', type, text, subj: subjOf(text), due, priority: 'easy' }] };
  }

  // tick things off
  m = s.match(/^(?:mark|tick|check|complete|finish(?:ed)?|done(?: with)?|i (?:finished|completed|did))\s+(?:off\s+)?(?:the\s+)?(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|off))?$/i);
  if (m) return { say: '', actions: [{ do: 'complete', task: clean(m[1]) }] };

  // open a screen
  m = low.match(/^(open|go to|show( me)?)\s+(the\s+)?(home|tasks?|to-?dos?|dailies|study|planner|tests?|marks|store|shop|radar|settings|profile|you)\b/);
  if (m) {
    const k = m[4];
    const screen = /task|todo|dail/.test(k) ? 'tasks' : /study|plan/.test(k) ? 'study' : /test|mark/.test(k) ? 'tests' : /store|shop/.test(k) ? 'store' : /radar/.test(k) ? 'radar' : /setting|profile|you/.test(k) ? 'you' : 'home';
    return { say: '', actions: [{ do: 'open', screen }] };
  }

  // questions about the day
  if (/(what('?s| is)? next|what do i have|what('?s| is) (on|planned)|my (plan|schedule))/.test(low)) return { say: ctx.answers.next, actions: [] };
  if (/\b(health|hp)\b/.test(low)) return { say: ctx.answers.health, actions: [] };
  if (/\bboss\b/.test(low)) return { say: ctx.answers.boss, actions: [] };
  if (/\b(gold|coins|money)\b/.test(low)) return { say: ctx.answers.gold, actions: [] };
  if (/\b(level|xp|experience)\b/.test(low)) return { say: ctx.answers.level, actions: [] };
  if (/\b(dailies|daily|left today|pending|to-?dos?)\b/.test(low)) return { say: ctx.answers.left, actions: [] };
  if (/\b(remind|reminders)\b/.test(low)) return { say: ctx.answers.reminders, actions: [] };
  if (/\b(days? (left|to)|exam|jee)\b/.test(low)) return { say: ctx.answers.exam, actions: [] };
  return null;
}

// Loose text match for "tick off physics notes" → the task whose words overlap most.
export function bestMatch(query, items, textOf = (x) => x.text) {
  const words = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['the', 'my', 'to', 'a', 'an', 'of', 'and', 'for'].includes(w));
  const q = words(query);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const it of items) {
    const w = words(textOf(it));
    const hits = q.filter((x) => w.some((y) => y.startsWith(x) || x.startsWith(y))).length;
    const score = hits / Math.max(q.length, 1) + (textOf(it).toLowerCase() === query.toLowerCase() ? 1 : 0);
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return bestScore >= 0.5 ? best : null;
}
