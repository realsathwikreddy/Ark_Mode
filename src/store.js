import { useEffect, useState } from 'preact/hooks';
import { Preferences } from '@capacitor/preferences';
import * as E from './engine.js';
import { seedPTs, seedBacklog, seedTasks, seedRewards } from './seed.js';
import { bossFor } from './bosses.jsx';
import { ACHIEVEMENTS, newlyEarned } from './achievements.js';
import { sfx, setSoundEnabled } from './sfx.js';
import { haptic, setHapticsEnabled } from './native.js';

const KEY = 'arkmode-state-v1';
const UI_KEYS = ['toasts', 'queue', 'bossFx', 'checkin'];
let state = null;
const listeners = new Set();
let saveTimer = null;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const now = () => Date.now();
export const today = () => E.dayKey(now(), state?.settings?.dayStart ?? 3);

const emptyTargets = () => ({ mains: { m: null, p: null, c: null }, adv: { m: null, p: null, c: null } });
const DEFAULT_SETTINGS = {
  name: 'John', dayStart: 3, restMode: false, reminders: true, reminderTime: '22:00',
  examDate: '2027-01-22', examName: 'JEE Main, session 1', focusMinutes: 50, breakMinutes: 10,
  sound: true, haptics: true, targets: emptyTargets(),
};

function initialState() {
  const t = E.dayKey(now(), 3);
  return {
    version: 2,
    user: { hp: 50, exp: 0, lvl: 1, gp: 0, deaths: 0 },
    settings: { ...DEFAULT_SETTINGS, targets: emptyTargets() },
    tasks: seedTasks(t),
    rewards: seedRewards(),
    pts: seedPTs(),
    backlog: seedBacklog(),
    focus: { running: null, sessions: [] },
    history: {},
    stats: { tasksDone: 0 },
    boss: null,
    bossHistory: [],
    achievements: {},
    lastCron: t,
    checkin: null,
    toasts: [],
    queue: [],
    bossFx: null,
  };
}

// Older saves don't have the new fields; fill them in without touching what's there.
function migrate(saved) {
  const base = initialState();
  return {
    ...base,
    ...saved,
    settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}), targets: { ...emptyTargets(), ...(saved.settings?.targets || {}) } },
    stats: { ...base.stats, ...(saved.stats || {}) },
    bossHistory: saved.bossHistory || [],
    achievements: saved.achievements || {},
    toasts: [], queue: [], bossFx: null, checkin: null,
  };
}

export async function loadState() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    state = value ? migrate(JSON.parse(value)) : initialState();
    if (!value) persist();
  } catch {
    state = initialState();
  }
  setSoundEnabled(state.settings.sound);
  setHapticsEnabled(state.settings.haptics);
  // Credit badges already earned before achievements existed, quietly.
  const earned = newlyEarned(state, today());
  if (earned.length) state = { ...state, achievements: { ...state.achievements, ...Object.fromEntries(earned.map((id) => [id, today()])) } };
  return state;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
export async function flush() {
  clearTimeout(saveTimer);
  if (!state) return;
  const rest = { ...state };
  UI_KEYS.forEach((k) => delete rest[k]);
  try { await Preferences.set({ key: KEY, value: JSON.stringify(rest) }); } catch (e) { console.error(e); }
}

export function getState() { return state; }

export function setState(updater, { save = true } = {}) {
  let next = typeof updater === 'function' ? updater(state) : updater;
  if (!next || next === state) return;
  if (save) next = checkAchievements(next);
  state = next;
  listeners.forEach((l) => l(state));
  if (save) persist();
}

export function useStore() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return state;
}

// ---------- toasts & overlays ----------
function scheduleToastRemoval(id) {
  setTimeout(() => setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }), { save: false }), 2800);
}
function withToast(s, text, tone = 'info') {
  const id = uid();
  scheduleToastRemoval(id);
  return { ...s, toasts: [...(s.toasts || []), { id, text, tone }] };
}
export function toast(text, tone = 'info') {
  setState((s) => withToast(s, text, tone), { save: false });
}
function enqueue(s, item) {
  return { ...s, queue: [...(s.queue || []), { id: uid(), ...item }] };
}
export function dismissOverlay(id) {
  setState((s) => ({ ...s, queue: s.queue.filter((q) => q.id !== id) }), { save: false });
}

function checkAchievements(s) {
  const ids = newlyEarned(s, E.dayKey(now(), s.settings?.dayStart ?? 3));
  if (!ids.length) return s;
  let next = { ...s, achievements: { ...s.achievements, ...Object.fromEntries(ids.map((id) => [id, today()])) } };
  ids.forEach((id) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    next = withToast(next, `Achievement unlocked: ${a.name}`, 'ach');
  });
  setTimeout(() => { sfx.badge(); haptic('success'); }, 350);
  return next;
}

function fmtGain(g) {
  const parts = [];
  if (g.exp) parts.push(`${g.exp > 0 ? '+' : ''}${g.exp} XP`);
  if (g.gp && Math.abs(g.gp) >= 0.01) parts.push(`${g.gp > 0 ? '+' : ''}${g.gp.toFixed(1)} gold`);
  if (g.hp) parts.push(`${g.hp} HP`);
  return parts.join('   ');
}

function cleanUser(u) {
  const { events, ...rest } = u;
  return rest;
}

function logDay(s, patch) {
  const k = today();
  const h = s.history[k] || {};
  const out = { ...h };
  Object.entries(patch).forEach(([key, v]) => { out[key] = (out[key] || 0) + v; });
  return { ...s.history, [k]: out };
}

// Level-ups and deaths become full-screen moments.
function handleEvents(s, events = []) {
  let next = s;
  events.forEach((e) => {
    if (e.kind === 'levelup') { next = enqueue(next, { kind: 'level', lvl: e.lvl }); sfx.level(); haptic('success'); }
    if (e.kind === 'death') { next = enqueue(next, { kind: 'death', lvl: e.lvl }); sfx.death(); haptic('heavy'); }
  });
  return next;
}

// ---------- boss ----------
function hitBoss(s, gp) {
  const b = s.boss;
  if (!b || b.status !== 'active' || !gp) return s;
  const dmg = E.bossDamage(gp);
  if (!dmg) return s;
  const hp = Math.max(0, Math.min(b.maxHp, b.hp - dmg));
  let next = { ...s, boss: { ...b, hp, dealt: (b.dealt || 0) + dmg }, bossFx: { amount: dmg, at: now() }, history: logDay(s, { bossDmg: dmg }) };
  if (dmg > 0 && hp > 0) { sfx.hit(); haptic('medium'); }
  if (hp === 0) next = defeatBoss(next);
  return next;
}

function defeatBoss(s) {
  const b = s.boss;
  const user = E.grantFlat(s.user, E.BOSS_REWARD.gp, E.BOSS_REWARD.exp);
  let next = {
    ...s,
    user: cleanUser(user),
    boss: { ...b, hp: 0, status: 'defeated', endedOn: today() },
    bossHistory: [...(s.bossHistory || []), { n: b.n, name: b.name, result: 'defeated', day: today(), hitsOnYou: b.hitsOnYou || 0 }],
  };
  next = enqueue(next, { kind: 'bossDown', n: b.n, name: b.name, gp: E.BOSS_REWARD.gp, exp: E.BOSS_REWARD.exp });
  setTimeout(() => { sfx.bossDown(); haptic('heavy'); }, 120);
  return handleEvents(next, user.events);
}

// Ends a boss whose week is over, and brings in this week's boss if there is one.
function ensureBoss(s, t) {
  let next = s;
  const b = s.boss;
  if (b && b.status === 'active' && t > b.end) {
    next = {
      ...next,
      boss: { ...b, status: 'escaped', endedOn: t },
      bossHistory: [...(next.bossHistory || []), { n: b.n, name: b.name, result: 'escaped', day: t, hitsOnYou: b.hitsOnYou || 0 }],
    };
    next = enqueue(next, { kind: 'bossEscape', n: b.n, name: b.name, hp: b.hp, maxHp: b.maxHp });
  }
  const cur = next.boss;
  const busy = cur && cur.status === 'active';
  if (!busy) {
    const fought = (next.bossHistory || []).map((x) => x.n);
    const pt = E.bossPTFor(next.pts, t, fought);
    if (pt && !(cur && cur.n === pt.n)) {
      const w = E.bossWindow(pt);
      const maxHp = E.bossMaxHp(next.user.lvl);
      next = { ...next, boss: { n: pt.n, name: bossFor(pt.n).name, maxHp, hp: maxHp, start: w.start, end: w.end, status: 'active', hitsOnYou: 0, dealt: 0 } };
      next = enqueue(next, { kind: 'bossArrive', n: pt.n, name: bossFor(pt.n).name, maxHp, end: w.end });
    }
  }
  return next;
}

// ---------- task actions ----------
// Each returns what was gained, so the row can animate it.
export function scoreHabit(id, dir) {
  let gain = null;
  setState((s) => {
    const t = s.tasks.find((x) => x.id === id);
    const res = E.scoreHabit(s.user, t, dir);
    gain = res.gain;
    let next = { ...s, user: cleanUser(res.user), tasks: s.tasks.map((x) => (x.id === id ? res.task : x)), history: logDay(s, { xp: res.gain.exp, gp: res.gain.gp, hpLost: Math.min(0, res.gain.hp) }) };
    if (dir === 'up') next = { ...next, stats: { ...next.stats, tasksDone: (next.stats?.tasksDone || 0) + 1 } };
    else { sfx.bad(); haptic('warning'); }
    next = hitBoss(next, res.gain.gp);
    return handleEvents(next, res.user.events);
  });
  return gain;
}

export function toggleTask(id) {
  let gain = null;
  setState((s) => {
    const t = s.tasks.find((x) => x.id === id);
    const undo = t.completed;
    const res = undo ? E.uncompleteTask(s.user, t) : E.completeTask(s.user, t, now());
    gain = res.gain;
    let next = { ...s, user: cleanUser(res.user), tasks: s.tasks.map((x) => (x.id === id ? res.task : x)), history: logDay(s, { xp: res.gain.exp, gp: res.gain.gp }) };
    next = { ...next, stats: { ...next.stats, tasksDone: Math.max(0, (next.stats?.tasksDone || 0) + (undo ? -1 : 1)) } };
    next = hitBoss(next, res.gain.gp);
    return handleEvents(next, res.user.events);
  });
  return gain;
}

export function toggleChecklist(taskId, itemId) {
  setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id !== taskId ? t : { ...t, checklist: t.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) })),
  }));
}

export function saveTask(task) {
  setState((s) => {
    const exists = s.tasks.some((t) => t.id === task.id);
    return { ...s, tasks: exists ? s.tasks.map((t) => (t.id === task.id ? task : t)) : [task, ...s.tasks] };
  });
}

export function deleteTask(id) {
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
}

export function clearDoneTodos() {
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => !(t.type === 'todo' && t.completed)) }));
}

export function moveTask(id, dir) {
  setState((s) => {
    const tasks = [...s.tasks];
    const i = tasks.findIndex((t) => t.id === id);
    const type = tasks[i].type;
    let j = i + dir;
    while (j >= 0 && j < tasks.length && tasks[j].type !== type) j += dir;
    if (j < 0 || j >= tasks.length) return s;
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
    return { ...s, tasks };
  });
}

// ---------- rewards ----------
export function buyReward(id) {
  let ok = false;
  setState((s) => {
    const r = s.rewards.find((x) => x.id === id);
    const res = E.buyReward(s.user, r);
    if (!res) return withToast(s, `You need ${(r.cost - s.user.gp).toFixed(1)} more gold.`, 'bad');
    ok = true;
    sfx.coin(); haptic('light');
    return withToast({ ...s, user: cleanUser(res.user), history: logDay(s, { spent: r.cost }) }, `Bought: ${r.text}`, 'good');
  });
  return ok;
}
export function saveReward(r) {
  setState((s) => ({ ...s, rewards: s.rewards.some((x) => x.id === r.id) ? s.rewards.map((x) => (x.id === r.id ? r : x)) : [...s.rewards, r] }));
}
export function deleteReward(id) {
  setState((s) => ({ ...s, rewards: s.rewards.filter((r) => r.id !== id) }));
}

// ---------- grants (focus, backlog, papers) ----------
export function grantReward(priority, scale = 1, why = '', { quiet = false } = {}) {
  let gain = null;
  setState((s) => {
    const res = E.grant(s.user, priority, scale);
    gain = res.gain;
    let next = { ...s, user: cleanUser(res.user), history: logDay(s, { xp: res.gain.exp, gp: res.gain.gp }) };
    if (!quiet) {
      const t = fmtGain(res.gain);
      next = withToast(next, why ? `${why}   ${t}` : t, res.gain.exp < 0 ? 'bad' : 'good');
    }
    next = hitBoss(next, res.gain.gp);
    return handleEvents(next, res.user.events);
  });
  return gain;
}

// ---------- day reset ----------
// On open/resume: if a new app-day started, ask about yesterday's open dailies first
// (like Habitica's "record yesterday's activity"), then run the reset.
export function checkDay() {
  const s = state;
  const t = today();
  if (s.checkin) return;
  if (!s.lastCron || s.lastCron >= t) {
    const b = ensureBoss(s, t);
    if (b !== s) setState(b);
    return;
  }
  const open = s.settings.restMode ? [] : E.openDailies(s.tasks, s.lastCron);
  if (open.length) {
    setState({ ...s, checkin: { day: s.lastCron, ids: open.map((d) => d.id) } }, { save: false });
  } else {
    finishCheckin([]);
  }
}

export function finishCheckin(doneIds) {
  setState((s0) => {
    const yday = s0.lastCron;
    let s = { ...s0, checkin: null };
    let user = s.user;
    let dealt = 0;
    const tasks = s.tasks.map((t) => {
      if (!doneIds.includes(t.id)) return t;
      const res = E.completeTask(user, t, now());
      user = res.user;
      dealt += res.gain.gp;
      return res.task;
    });
    s = { ...s, user: cleanUser(user), tasks };
    // Late ticks for yesterday still hurt yesterday's boss.
    if (dealt && s.boss?.status === 'active' && yday >= s.boss.start && yday <= s.boss.end) {
      const dmg = E.bossDamage(dealt);
      const hp = Math.max(0, s.boss.hp - dmg);
      const h = s.history[yday] || {};
      s = { ...s, boss: { ...s.boss, hp, dealt: (s.boss.dealt || 0) + dmg }, history: { ...s.history, [yday]: { ...h, bossDmg: (h.bossDmg || 0) + dmg } } };
      if (hp === 0) s = defeatBoss(s);
    }

    const t = today();
    const { state: after, report } = E.runCron(s, t);
    let next = { ...after, user: cleanUser(after.user) };
    if (report?.died) next = handleEvents(next, [{ kind: 'death', lvl: next.user.lvl }]);

    // The boss hits back for each daily you missed while it was here.
    let bossHit = 0;
    const b = next.boss;
    if (report && !report.rest && report.missed.length && b?.status === 'active' && yday >= b.start && yday <= b.end) {
      bossHit = E.bossCounter(report.missed);
      const hurt = E.hurt(next.user, bossHit);
      next = { ...next, user: cleanUser(hurt), boss: { ...b, hitsOnYou: (b.hitsOnYou || 0) + 1 } };
      next = handleEvents(next, hurt.events);
    }

    if (report) {
      const h = next.history[report.day] || {};
      next = { ...next, history: { ...next.history, [report.day]: { ...h, bossHit } } };
      if ((h.due || 0) > 0 || (h.xp || 0) > 0 || (h.focusMin || 0) > 0) {
        next = enqueue(next, {
          kind: 'summary', day: report.day, due: h.due || 0, done: h.done || 0,
          hpLost: Math.round((Math.abs(report.damage) + bossHit) * 10) / 10, bossHit,
          bossDmg: h.bossDmg || 0, focusMin: h.focusMin || 0, xp: h.xp || 0, rest: report.rest,
          bossName: b?.status === 'active' || (b && b.endedOn >= report.day) ? b.name : null,
        });
      }
    }
    return ensureBoss(next, t);
  });
}

// ---------- settings ----------
export function setSetting(key, value) {
  if (key === 'sound') setSoundEnabled(value);
  if (key === 'haptics') setHapticsEnabled(value);
  setState((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
}
export function setTarget(kind, subj, value) {
  setState((s) => {
    const targets = s.settings.targets || emptyTargets();
    return { ...s, settings: { ...s.settings, targets: { ...targets, [kind]: { ...targets[kind], [subj]: value } } } };
  });
}

// ---------- PT tracker ----------
export function updatePaper(ptId, paperId, patch) {
  setState((s) => ({
    ...s,
    pts: s.pts.map((pt) => (pt.id !== ptId ? pt : { ...pt, papers: pt.papers.map((p) => (p.id === paperId ? { ...p, ...patch } : p)) })),
  }));
}
export function addPaper(ptId, kind) {
  setState((s) => ({
    ...s,
    pts: s.pts.map((pt) => {
      if (pt.id !== ptId) return pt;
      const last = pt.papers[pt.papers.length - 1];
      return {
        ...pt,
        papers: [...pt.papers, { id: uid(), kind, name: kind === 'mains' ? 'Extra Mains paper' : 'Extra Advanced paper', date: last?.date || today(), scores: { m: null, p: null, c: null }, max: kind === 'mains' ? { m: 100, p: 100, c: 100 } : { m: null, p: null, c: null }, rank: '', note: '', mistakes: [] }],
      };
    }),
  }));
}
export function deletePaper(ptId, paperId) {
  setState((s) => ({ ...s, pts: s.pts.map((pt) => (pt.id !== ptId ? pt : { ...pt, papers: pt.papers.filter((p) => p.id !== paperId) })) }));
}

// ---------- backlog ----------
export function toggleStage(id, stage) {
  const before = state.backlog.find((x) => x.id === id);
  const wasCleared = Object.values(before.stages).every(Boolean);
  const gained = !before.stages[stage];
  setState((s) => ({
    ...s,
    backlog: s.backlog.map((b) => (b.id !== id ? b : { ...b, stages: { ...b.stages, [stage]: !b.stages[stage] } })),
  }));
  const b = state.backlog.find((x) => x.id === id);
  if (gained) {
    const cleared = Object.values(b.stages).every(Boolean);
    sfx.tick(); haptic('light');
    return grantReward('hard', cleared ? 2 : 1, cleared ? `${b.chapter} cleared` : '');
  }
  sfx.untick();
  return grantReward('hard', wasCleared ? -2 : -1);
}
export function addBacklog(subj, chapter) {
  setState((s) => ({ ...s, backlog: [...s.backlog, { id: uid(), subj, chapter, stages: { theory: false, practice: false, pyq: false } }] }));
}
export function deleteBacklog(id) {
  setState((s) => ({ ...s, backlog: s.backlog.filter((b) => b.id !== id) }));
}

// ---------- focus ----------
export function startFocus(minutes, label, subj) {
  setState((s) => ({ ...s, focus: { ...s.focus, running: { start: now(), minutes, label, subj, kind: 'focus' } } }));
}
export function startBreak(minutes) {
  setState((s) => ({ ...s, focus: { ...s.focus, running: { start: now(), minutes, kind: 'break' } } }));
}
export function stopFocus(completed) {
  const r = state.focus.running;
  if (!r) return;
  const elapsed = Math.min(r.minutes, Math.floor((now() - r.start) / 60000));
  const counts = r.kind === 'focus' && elapsed >= 5;
  setState((s) => {
    const sessions = counts ? [...s.focus.sessions, { day: today(), min: elapsed, subj: r.subj, label: r.label }] : s.focus.sessions;
    const history = counts ? logDay(s, { focusMin: elapsed }) : s.history;
    return { ...s, history, focus: { running: null, sessions: sessions.slice(-500) } };
  });
  if (r.kind === 'break') {
    if (completed) { sfx.chime(); haptic('success'); toast('Break over. Back to it.', 'info'); }
    return;
  }
  if (!counts) { toast('Under 5 minutes, so nothing was logged.', 'info'); return; }
  if (completed) {
    const gain = grantReward('easy', elapsed / 25, '', { quiet: true });
    setState((s) => enqueue(s, { kind: 'focus', min: elapsed, label: r.label, subj: r.subj, gp: gain.gp, exp: gain.exp }), { save: false });
    sfx.chime(); haptic('success');
  } else {
    grantReward('easy', elapsed / 25, `Stopped early: ${elapsed} minutes logged`);
  }
}

// ---------- backup ----------
export function exportData() {
  const rest = { ...state };
  UI_KEYS.forEach((k) => delete rest[k]);
  return JSON.stringify({ app: 'arkmode', exportedAt: new Date().toISOString(), data: rest }, null, 1);
}
export function importData(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  if (!data.user || !Array.isArray(data.tasks)) throw new Error('This file is not an Ark Mode backup.');
  setState(migrate(data));
}
export function resetAll() {
  setState(initialState());
}
