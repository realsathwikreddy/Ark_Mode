import { useEffect, useState } from 'preact/hooks';
import { Preferences } from '@capacitor/preferences';
import * as E from './engine.js';
import { seedPTs, seedBacklog, seedTasks, seedRewards } from './seed.js';
import { bossFor } from './bosses.jsx';
import { ACHIEVEMENTS, newlyEarned } from './achievements.js';
import { sfx, setSoundEnabled } from './sfx.js';
import { haptic, setHapticsEnabled, screenUsage, screenPermission, isNative } from './native.js';
import { FRAMES } from './frames.jsx';
import { blockRange, nowAndNext } from './planner.js';
import { fetchJson } from './updates.js';
import { feedConfigure, feedSchedule, feedTakePending } from './native.js';
import { parseJson } from './claude.js';
import { ask, hasBrain, brainLabel } from './brain.js';
import { parseOffline, bestMatch, localIso, whenWords, dateKey } from './arkparse.js';
import { scheduleFocusEnd, scheduleArkReminders } from './native.js';

const KEY = 'arkmode-state-v1';
const UI_KEYS = ['toasts', 'queue', 'bossFx', 'checkin', 'undo', 'locked', 'screenToday', 'quickAdd', 'fx', 'update', 'arkOpen'];
let state = null;
const listeners = new Set();
let saveTimer = null;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const now = () => Date.now();
export const today = () => E.dayKey(now(), state?.settings?.dayStart ?? 3);

const emptyTargets = () => ({ mains: { m: null, p: null, c: null }, adv: { m: null, p: null, c: null } });
const DEFAULT_SETTINGS = {
  name: 'Sathwik', dayStart: 3, restMode: false, reminders: true, reminderTime: '22:00',
  examDate: '2027-01-22', examName: 'JEE Main, session 1', focusMinutes: 50, breakMinutes: 10,
  sound: true, haptics: true, targets: emptyTargets(), theme: 'neon',
  lock: { enabled: false, pinHash: null, bio: false },
  screen: { enabled: false, limits: [] },
  radar: { cats: ['hackathon', 'ai', 'music', 'internship', 'jee'], places: ['online', 'hyderabad', 'india', 'international'], notify: true },
  claude: { key: '', model: 'claude-sonnet-5-5' },
  gemini: { key: '', model: '' },
  brain: 'gemini',
  arkVoice: true,
  lens: true,
};
const emptyRadar = () => ({ items: [], saved: [], dismissed: [], read: [], updated: null, smart: false, verdicts: {} });

function initialState() {
  const t = E.dayKey(now(), 3);
  return {
    version: 3,
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
    plan: [],
    reminders: [],
    planDone: {},
    store: { owned: [], frame: null },
    radar: emptyRadar(),
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
    settings: {
      ...DEFAULT_SETTINGS, ...(saved.settings || {}),
      targets: { ...emptyTargets(), ...(saved.settings?.targets || {}) },
      lock: { ...DEFAULT_SETTINGS.lock, ...(saved.settings?.lock || {}) },
      screen: { ...DEFAULT_SETTINGS.screen, ...(saved.settings?.screen || {}) },
      radar: { ...DEFAULT_SETTINGS.radar, ...(saved.settings?.radar || {}) },
      claude: { ...DEFAULT_SETTINGS.claude, ...(saved.settings?.claude || {}) },
      gemini: { ...DEFAULT_SETTINGS.gemini, ...(saved.settings?.gemini || {}) },
    },
    radar: { ...emptyRadar(), ...(saved.radar || {}) },
    plan: saved.plan || [],
    reminders: (saved.reminders || []).filter((r) => r.at > Date.now() - 86400000),
    planDone: saved.planDone || {},
    store: { owned: [], frame: null, ...(saved.store || {}) },
    stats: { ...base.stats, ...(saved.stats || {}) },
    bossHistory: saved.bossHistory || [],
    achievements: saved.achievements || {},
    toasts: [], queue: [], bossFx: null, checkin: null, undo: null,
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
  if (state.settings.lock?.enabled && state.settings.lock.pinHash) state = { ...state, locked: true };
  // The name was wrong in earlier versions.
  if (!state.settings.name || state.settings.name === 'John') state = { ...state, settings: { ...state.settings, name: 'Sathwik' } };
  setSoundEnabled(state.settings.sound);
  setHapticsEnabled(state.settings.haptics);
  // Bosses got tougher (x1.7). Scale a boss that's already in the fight, keeping the damage done.
  if (state.boss?.status === 'active' && !state.boss.tough) {
    const b = state.boss;
    const maxHp = Math.round(b.maxHp * 1.7);
    state = { ...state, boss: { ...b, maxHp, hp: Math.max(1, maxHp - (b.maxHp - b.hp)), tough: true } };
  }
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

// ---------- undo ----------
function snapshot() {
  const r = { ...state };
  UI_KEYS.forEach((k) => delete r[k]);
  return r;
}
function offerUndo(label, snap) {
  const id = uid();
  setState((s) => ({ ...s, undo: { id, label, snap } }), { save: false });
  setTimeout(() => setState((s) => (s.undo?.id === id ? { ...s, undo: null } : s), { save: false }), 5000);
}
export function undo() {
  const u = state.undo;
  if (!u) return;
  setState((s) => ({ ...u.snap, toasts: s.toasts, queue: [], bossFx: null, checkin: null, undo: null, locked: false, screenToday: s.screenToday, fx: null }));
  sfx.untick(); haptic('light');
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
      next = { ...next, boss: { n: pt.n, name: bossFor(pt.n).name, maxHp, hp: maxHp, start: w.start, end: w.end, status: 'active', hitsOnYou: 0, dealt: 0, tough: true } };
      next = enqueue(next, { kind: 'bossArrive', n: pt.n, name: bossFor(pt.n).name, maxHp, end: w.end });
    }
  }
  return next;
}

// ---------- task actions ----------
// Each returns what was gained, so the row can animate it.
export function scoreHabit(id, dir) {
  const snap = snapshot();
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
  offerUndo(dir === 'up' ? 'Habit scored' : 'Bad habit logged', snap);
  return gain;
}

export function toggleTask(id) {
  const snap = snapshot();
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
  offerUndo('Task updated', snap);
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
  const snap = snapshot();
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
  offerUndo('Task deleted', snap);
}

export function clearDoneTodos() {
  const snap = snapshot();
  setState((s) => ({ ...s, tasks: s.tasks.filter((t) => !(t.type === 'todo' && t.completed)) }));
  offerUndo('Finished to-dos cleared', snap);
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
  const snap = snapshot();
  let ok = false;
  setState((s) => {
    const r = s.rewards.find((x) => x.id === id);
    const res = E.buyReward(s.user, r);
    if (!res) return withToast(s, `You need ${(r.cost - s.user.gp).toFixed(1)} more gold.`, 'bad');
    ok = true;
    sfx.coin(); haptic('light');
    return withToast({ ...s, user: cleanUser(res.user), history: logDay(s, { spent: r.cost }) }, `Bought: ${r.text}`, 'good');
  });
  if (ok) offerUndo('Reward bought', snap);
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
let checking = false;
export async function checkDay() {
  if (checking) return;
  const s0 = state;
  const t = today();
  if (s0.checkin || s0.locked) return;
  if (!s0.lastCron || s0.lastCron >= t) {
    const b = ensureBoss(s0, t);
    if (b !== s0) setState(b);
    return;
  }
  checking = true;
  try { await collectScreenDays(s0.lastCron, t); } catch (e) { console.warn('screen', e); }
  checking = false;
  const s = state;
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

    // Screen time for that day: kept limits pay gold, broken ones cost health and heal the boss.
    let screen = null;
    const sh = report && next.history[report.day]?.screen;
    const limits = next.settings.screen?.limits || [];
    if (report && sh && !sh.applied && next.settings.screen?.enabled && limits.length) {
      const v = E.screenVerdict(limits, sh.used || {});
      let u = next.user;
      if (v.gp) u = cleanUser(E.grantFlat(u, v.gp, 0));
      if (v.hp) { const h2 = E.hurt(u, v.hp); next = handleEvents(next, h2.events); u = cleanUser(h2); }
      next = { ...next, user: u };
      const bb = next.boss;
      if (bb?.status === 'active' && report.day >= bb.start && report.day <= bb.end) {
        let bhp = Math.min(bb.maxHp, bb.hp + v.heal);
        bhp = Math.max(0, bhp - v.bonusHit);
        next = { ...next, boss: { ...bb, hp: bhp } };
        if (bhp === 0) next = defeatBoss(next);
      }
      next = { ...next, history: { ...next.history, [report.day]: { ...next.history[report.day], screen: { ...sh, applied: true, verdict: v } } } };
      screen = { ...v, total: sh.total, pickups: sh.pickups };
    }

    if (report) {
      const h = next.history[report.day] || {};
      next = { ...next, history: { ...next.history, [report.day]: { ...h, bossHit } } };
      if ((h.due || 0) > 0 || (h.xp || 0) > 0 || (h.focusMin || 0) > 0 || screen) {
        next = enqueue(next, {
          kind: 'summary', day: report.day, due: h.due || 0, done: h.done || 0,
          hpLost: Math.round((Math.abs(report.damage) + bossHit) * 10) / 10, bossHit,
          bossDmg: h.bossDmg || 0, focusMin: h.focusMin || 0, xp: h.xp || 0, rest: report.rest, screen,
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
  const snap = snapshot();
  setState((s) => ({ ...s, pts: s.pts.map((pt) => (pt.id !== ptId ? pt : { ...pt, papers: pt.papers.filter((p) => p.id !== paperId) })) }));
  offerUndo('Paper removed', snap);
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
  const snap = snapshot();
  setState((s) => ({ ...s, backlog: s.backlog.filter((b) => b.id !== id) }));
  offerUndo('Chapter removed', snap);
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

// ---------- store ----------
export function drinkPotion() {
  const snap = snapshot();
  let ok = false;
  setState((s) => {
    const u = E.drinkPotion(s.user);
    if (!u) return withToast(s, s.user.hp >= E.MAX_HP ? 'Health is already full.' : `You need ${(E.POTION.cost - s.user.gp).toFixed(1)} more gold.`, 'bad');
    ok = true;
    return { ...s, user: cleanUser(u), history: logDay(s, { spent: E.POTION.cost }), fx: { kind: 'heal', at: now() } };
  });
  if (ok) { sfx.heal(); haptic('success'); offerUndo('Drank a Health Potion', snap); }
  return ok;
}
export function buyFrame(id) {
  const f = FRAMES.find((x) => x.id === id);
  const snap = snapshot();
  let ok = false;
  setState((s) => {
    if (s.store.owned.includes(id)) return s;
    if (s.user.gp < f.cost) return withToast(s, `You need ${(f.cost - s.user.gp).toFixed(1)} more gold.`, 'bad');
    ok = true;
    return withToast({ ...s, user: { ...s.user, gp: s.user.gp - f.cost }, store: { owned: [...s.store.owned, id], frame: id }, history: logDay(s, { spent: f.cost }), fx: { kind: 'frame', at: now() } }, `${f.name} unlocked and equipped`, 'good');
  });
  if (ok) { sfx.badge(); haptic('success'); offerUndo('Frame bought', snap); }
  return ok;
}
export function equipFrame(id) {
  setState((s) => ({ ...s, store: { ...s.store, frame: s.store.frame === id ? null : id } }));
  sfx.tick();
}

// ---------- planner ----------
export function saveBlock(b) {
  setState((s) => ({ ...s, plan: s.plan.some((x) => x.id === b.id) ? s.plan.map((x) => (x.id === b.id ? b : x)) : [...s.plan, b] }));
}
export function deleteBlock(id) {
  const snap = snapshot();
  setState((s) => ({ ...s, plan: s.plan.filter((b) => b.id !== id) }));
  offerUndo('Block deleted', snap);
}
// Ticking a planned block pays like an easy task per hour planned (min half).
export function toggleBlock(day, b) {
  const snap = snapshot();
  const done = (state.planDone[day] || []).includes(b.id);
  setState((s) => {
    const list = s.planDone[day] || [];
    return { ...s, planDone: { ...s.planDone, [day]: done ? list.filter((x) => x !== b.id) : [...list, b.id] } };
  });
  const r = blockRange(b, day, state.settings.dayStart ?? 3);
  const hours = Math.max(0.5, (r.end - r.start) / 3600000);
  const gain = grantReward('easy', done ? -hours : hours, '', { quiet: true });
  offerUndo(done ? 'Block unticked' : 'Block done', snap);
  return gain;
}

// ---------- app lock ----------
async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ark:${text}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function setPin(pin, bio) {
  const pinHash = await sha(pin);
  setState((s) => ({ ...s, settings: { ...s.settings, lock: { enabled: true, pinHash, bio: !!bio } } }));
}
export async function checkPin(pin) {
  return (await sha(pin)) === state.settings.lock.pinHash;
}
export function disableLock() {
  setState((s) => ({ ...s, settings: { ...s.settings, lock: { enabled: false, pinHash: null, bio: false } } }));
}
export function setLockBio(v) {
  setState((s) => ({ ...s, settings: { ...s.settings, lock: { ...s.settings.lock, bio: v } } }));
}
// Ark's microphone and Android's permission pop-ups briefly take the screen; that's not leaving the app.
let lockHold = 0;
export function holdLock(ms = 60000) { lockHold = Math.max(lockHold, now() + ms); }
export function releaseLock(ms = 5000) { lockHold = now() + ms; }
export function lockNow() {
  if (now() < lockHold) return;
  if (state.settings.lock?.enabled && state.settings.lock.pinHash) setState((s) => ({ ...s, locked: true }), { save: false });
}
export function unlock() {
  setState((s) => ({ ...s, locked: false }), { save: false });
  setTimeout(() => checkDay(), 50);
}

// ---------- quick add (from the widget) ----------
export function requestQuickAdd() {
  setState((s) => ({ ...s, quickAdd: now() }), { save: false });
}

// ---------- screen time ----------
export function setScreen(patch) {
  setState((s) => ({ ...s, settings: { ...s.settings, screen: { ...s.settings.screen, ...patch } } }));
}
export function usedByLimit(limits, apps) {
  const out = {};
  limits.forEach((l) => {
    const ms = apps.filter((a) => (l.kind === 'app' ? a.pkg === l.key : a.category === Number(l.key))).reduce((x, a) => x + a.ms, 0);
    out[l.id] = Math.round(ms / 60000);
  });
  return out;
}
function dayWindow(dayKey) {
  const ds = state.settings.dayStart ?? 3;
  const d = E.parseKey(dayKey);
  d.setHours(ds, 0, 0, 0);
  return { from: d.getTime(), to: d.getTime() + 86400000 };
}
export async function refreshScreenToday() {
  const sc = state.settings.screen;
  if (!sc?.enabled) return;
  if (!(await screenPermission())) { setState((s) => ({ ...s, screenToday: { denied: true } }), { save: false }); return; }
  const t = today();
  const { from } = dayWindow(t);
  const u = await screenUsage(from, now());
  const used = usedByLimit(sc.limits, u.apps);
  const total = Math.round(u.apps.reduce((a, x) => a + x.ms, 0) / 60000);
  setState((s) => ({ ...s, screenToday: { day: t, total, pickups: u.pickups, apps: u.apps.map((a) => ({ ...a, min: Math.round(a.ms / 60000) })).filter((a) => a.min > 0).sort((a, b) => b.min - a.min), used, at: now() } }), { save: false });
}
// Before a reset: record each finished day's screen time (up to a week back).
async function collectScreenDays(fromDay, toDay) {
  const sc = state.settings.screen;
  if (!sc?.enabled || !sc.limits.length) return;
  if (!(await screenPermission())) return;
  let day = fromDay;
  let guard = 0;
  const patch = {};
  while (day < toDay && guard++ < 7) {
    if (!state.history[day]?.screen) {
      const w = dayWindow(day);
      const u = await screenUsage(w.from, w.to);
      patch[day] = { total: Math.round(u.apps.reduce((a, x) => a + x.ms, 0) / 60000), pickups: u.pickups, used: usedByLimit(sc.limits, u.apps) };
    }
    day = E.addDays(day, 1);
  }
  if (Object.keys(patch).length) {
    setState((s) => {
      const history = { ...s.history };
      Object.entries(patch).forEach(([k, v]) => { history[k] = { ...(history[k] || {}), screen: v }; });
      return { ...s, history };
    });
  }
}

// ---------- radar (opportunities feed) ----------
export function radarItems(s) {
  const rs = s.settings.radar;
  const v = s.radar.verdicts || {};
  return s.radar.items
    .filter((i) => rs.cats.includes(i.cat) && rs.places.includes(i.place))
    .filter((i) => !(s.radar.smart && v[i.id] && v[i.id].score < 5))
    .map((i) => (v[i.id]?.summary ? { ...i, summary: v[i.id].summary } : i));
}
export function syncFeedPrefs() {
  const s = state;
  feedConfigure({ enabled: s.settings.radar.notify, cats: s.settings.radar.cats.join(','), places: s.settings.radar.places.join(','), seen: s.radar.items.map((i) => i.id).slice(-800).join(',') });
}
export function setRadar(patch) {
  setState((s) => ({ ...s, settings: { ...s.settings, radar: { ...s.settings.radar, ...patch } } }));
  syncFeedPrefs();
}
export function setRadarSmart(v) {
  setState((s) => ({ ...s, radar: { ...s.radar, smart: v } }));
  if (v) smartFilter().catch((e) => toast(e.message, 'bad'));
}
export function toggleSaved(id) {
  setState((s) => ({ ...s, radar: { ...s.radar, saved: s.radar.saved.includes(id) ? s.radar.saved.filter((x) => x !== id) : [...s.radar.saved, id] } }));
  sfx.tick();
}
export function dismissOpp(id) {
  const snap = snapshot();
  setState((s) => ({ ...s, radar: { ...s.radar, dismissed: [...s.radar.dismissed, id].slice(-600) } }));
  offerUndo('Hidden from Radar', snap);
}
export function markRadarRead() {
  setState((s) => ({ ...s, radar: { ...s.radar, read: s.radar.items.map((i) => i.id).slice(-800) } }));
}
export function radarUnread(s) {
  return radarItems(s).filter((i) => !s.radar.read.includes(i.id) && !s.radar.dismissed.includes(i.id)).length;
}
let radarBusy = false;
export async function refreshRadar({ manual = false } = {}) {
  if (radarBusy) return 0;
  const last = state.radar.fetchedAt || 0;
  if (!manual && Date.now() - last < 20 * 60000) return 0;
  radarBusy = true;
  try {
    const feed = await fetchJson('feed.json');
    const known = new Set(state.radar.items.map((i) => i.id));
    const keepSaved = state.radar.items.filter((i) => state.radar.saved.includes(i.id) && !feed.items.some((f) => f.id === i.id));
    const fresh = feed.items.filter((i) => !known.has(i.id));
    setState((s) => ({ ...s, radar: { ...s.radar, items: [...feed.items, ...keepSaved], updated: feed.updated, fetchedAt: Date.now() } }));
    syncFeedPrefs();
    if (state.radar.smart && hasBrain(state.settings)) smartFilter().catch(() => {});
    const rs = state.settings.radar;
    return fresh.filter((i) => rs.cats.includes(i.cat) && rs.places.includes(i.place)).length;
  } finally {
    radarBusy = false;
  }
}
// Claude reads listings it hasn't judged yet and scores them for Sathwik.
let smartBusy = false;
export async function smartFilter() {
  if (smartBusy || !hasBrain(state.settings)) return;
  smartBusy = true;
  try {
    const todo = radarItemsRaw().filter((i) => !state.radar.verdicts?.[i.id]).slice(0, 25);
    if (!todo.length) return;
    const list = todo.map((i, n) => `${n + 1}. [${i.cat}, ${i.place}${i.funded ? ', travel paid' : ''}] ${i.title} | ${i.source}${i.org ? ' / ' + i.org : ''} | ${i.when || ''} | ${i.detail || ''}`).join('\n');
    const text = await ask(state.settings, {
      system: 'You filter opportunities for Sathwik, a class 12 JEE aspirant in Hyderabad, India, who also loves music and AI. He wants hackathons, AI classes, music opportunities, internships open to school students, and JEE/college admission news. Events must be online, in Hyderabad, elsewhere in India, or abroad only if travel is paid. Score each item 0-10 for how worth his time it is (eligibility for a 17-year-old school student matters a lot). Reply with only JSON: [{"n":1,"score":7,"summary":"one short plain line"}].',
      prompt: list,
      maxTokens: 1800,
    });
    const arr = parseJson(text);
    const verdicts = { ...(state.radar.verdicts || {}) };
    arr.forEach((v) => { const it = todo[v.n - 1]; if (it) verdicts[it.id] = { score: Number(v.score) || 0, summary: String(v.summary || '').slice(0, 160) }; });
    setState((s) => ({ ...s, radar: { ...s.radar, verdicts } }));
  } finally {
    smartBusy = false;
  }
}
function radarItemsRaw() {
  const rs = state.settings.radar;
  return state.radar.items.filter((i) => rs.cats.includes(i.cat) && rs.places.includes(i.place) && !state.radar.dismissed.includes(i.id));
}
export async function startFeedWorker() {
  syncFeedPrefs();
  await feedSchedule();
  const n = await feedTakePending();
  return n;
}

// ---------- Claude settings & planner ----------
export function setClaude(patch) {
  setState((s) => ({ ...s, settings: { ...s.settings, claude: { ...s.settings.claude, ...patch } } }));
}
export async function planWithClaude(day, { from, to, focus }) {
  const s = state;
  const dayName = E.parseKey(day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
  const backlog = s.backlog.filter((b) => !Object.values(b.stages).every(Boolean)).map((b) => `${b.chapter} (${['m', 'p', 'c'].indexOf(b.subj) >= 0 ? { m: 'Maths', p: 'Physics', c: 'Chemistry' }[b.subj] : ''}; done: ${Object.entries(b.stages).filter(([, v]) => v).map(([k]) => k).join(', ') || 'nothing'})`).join('; ');
  const pt = s.pts.find((p) => p.papers.some((x) => x.date >= day));
  const ptLine = pt ? `Next part test PT-${pt.n} on ${pt.papers[0].date}. Syllabus: Maths ${pt.syllabus.m.join(', ')}; Physics ${pt.syllabus.p.join(', ')}; Chemistry ${pt.syllabus.c.join(', ')}.` : '';
  const weak = {};
  s.pts.forEach((p) => p.papers.forEach((x) => x.mistakes.forEach((m) => { weak[m.chapter] = (weak[m.chapter] || 0) + (Number(m.marks) || 0); })));
  const weakLine = Object.entries(weak).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, m]) => `${c} (-${m})`).join(', ');
  const existing = s.plan.filter((b) => (b.repeat === 'once' ? b.date === day : b.days?.[E.parseKey(day).getDay()])).map((b) => `${b.start}-${b.end} ${b.title}`).join('; ');
  const text = await ask(s.settings, {
    system: 'You plan study time blocks for Sathwik, a JEE aspirant at Narayana in Hyderabad. Make realistic blocks with short breaks, mixing subjects, prioritising the upcoming part-test syllabus, his backlog and his weakest chapters. Use 24-hour HH:MM times. Reply with only JSON: [{"start":"18:00","end":"19:00","title":"short specific task","subj":"m"|"p"|"c"|null}].',
    prompt: `Plan ${dayName}, free from ${from} to ${to}.${focus ? ` He wants to focus on: ${focus}.` : ''}\n${ptLine}\nBacklog: ${backlog || 'none'}.\nWeakest chapters from mistake log: ${weakLine || 'no data yet'}.\nAlready planned that day (do not overlap): ${existing || 'nothing'}.`,
    maxTokens: 1200,
  });
  const arr = parseJson(text);
  return arr
    .filter((b) => /^\d{1,2}:\d{2}$/.test(b.start) && /^\d{1,2}:\d{2}$/.test(b.end) && b.title)
    .map((b) => ({ id: uid(), title: String(b.title).slice(0, 80), subj: ['m', 'p', 'c'].includes(b.subj) ? b.subj : null, start: b.start.padStart(5, '0'), end: b.end.padStart(5, '0'), repeat: 'once', date: day, days: [0, 1, 2, 3, 4, 5, 6].map(() => false), ai: true }));
}
export function addBlocks(blocks) {
  const snap = snapshot();
  setState((s) => ({ ...s, plan: [...s.plan, ...blocks] }));
  offerUndo(`${blocks.length} blocks added`, snap);
}

// ---------- app updates ----------
export function setUpdate(u) {
  setState((s) => ({ ...s, update: u }), { save: false });
}

export function setGemini(patch) {
  setState((s) => ({ ...s, settings: { ...s.settings, gemini: { ...s.settings.gemini, ...patch } } }));
}

// ---------- Ark: the voice assistant ----------
const SUBJ_NAME = { m: 'Maths', p: 'Physics', c: 'Chemistry' };
const hm = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toUpperCase()}M`);

function arkContext() {
  const s = state;
  const t = today();
  const ds = s.settings.dayStart ?? 3;
  const nowMs = now();
  const due = s.tasks.filter((x) => E.isDue(x, t));
  const left = due.filter((x) => !x.completed);
  const todos = s.tasks.filter((x) => x.type === 'todo' && !x.completed);
  const { now: cur, next } = nowAndNextSafe(t, nowMs, ds);
  const b = s.boss?.status === 'active' ? s.boss : null;
  const rem = (s.reminders || []).filter((r) => r.at > nowMs).sort((a, z) => a.at - z.at);
  const days = s.settings.examDate ? E.daysBetween(t, s.settings.examDate) : null;
  const nextPaper = s.pts.flatMap((pt) => pt.papers.map((p) => ({ ...p, n: pt.n }))).filter((p) => p.date >= t).sort((a, z) => a.date.localeCompare(z.date))[0];
  const answers = {
    next: cur ? `Right now: ${cur.title}, until ${hm(cur.end)}.${next ? ` Then ${next.title} at ${hm(next.start)}.` : ''}` : next ? `Next up: ${next.title} at ${hm(next.start)}.` : `Nothing else planned today.${left.length ? ` You have ${left.length} ${left.length === 1 ? 'daily' : 'dailies'} left.` : ''}`,
    health: `You're at ${Math.round(s.user.hp)} out of ${E.MAX_HP} health.${s.user.hp < 20 ? ' That’s low. A potion costs 25 gold.' : ''}`,
    boss: b ? `${b.name} has ${b.hp} of ${b.maxHp} health left. It fights back on ${b.end}.` : 'No boss right now. The next one shows up on Monday.',
    gold: `You have ${s.user.gp.toFixed(1)} gold.`,
    level: `Level ${s.user.lvl}, ${E.titleFor(s.user.lvl)}. ${E.toNextLevel(s.user.lvl) - Math.round(s.user.exp)} XP to the next level.`,
    left: left.length ? `${left.length} left today: ${left.slice(0, 4).map((x) => x.text).join(', ')}.${todos.length ? ` Plus ${todos.length} open to-dos.` : ''}` : `All dailies done.${todos.length ? ` ${todos.length} to-dos still open.` : ''}`,
    reminders: rem.length ? `${rem.length} ${rem.length === 1 ? 'reminder' : 'reminders'}. Next: ${rem[0].text}, ${whenWords(rem[0].at, nowMs)}.` : 'No reminders set.',
    exam: days != null ? `${days} days to ${s.settings.examName || 'the exam'}.${nextPaper ? ` Next paper: ${nextPaper.name} on ${nextPaper.date}.` : ''}` : 'No exam date set.',
  };
  return { now: nowMs, today: t, focusMinutes: s.settings.focusMinutes, answers, due, left, todos, rem, cur, next, b, nextPaper };
}
function nowAndNextSafe(t, nowMs, ds) {
  try { return nowAndNext(state.plan, t, nowMs, ds); } catch { return { now: null, next: null, list: [] }; }
}

const ARK_SYSTEM = `You are Ark, the voice assistant inside Ark Mode, a habit and study app for Sathwik, a class 12 JEE aspirant in Hyderabad. He speaks to you; you turn what he says into app actions and a short spoken reply.
Reply with ONLY a JSON object: {"say": "...", "actions": [...]}.
"say" is spoken aloud: one or two short sentences, casual, like a sharp friend. Say times like "9:40 PM". No emoji, no markdown.
Actions (use only these, with exactly these fields):
{"do":"remind","text":"what to remind","at":"YYYY-MM-DDTHH:MM"}   (local time; must be in the future)
{"do":"cancel_reminder","text":"which one"}
{"do":"add_task","type":"todo"|"daily"|"habit","text":"short task","priority":"trivial"|"easy"|"medium"|"hard","subj":"m"|"p"|"c"|null,"due":"YYYY-MM-DD"|null}
{"do":"complete","task":"exact text of an open task from the list"}
{"do":"add_block","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","title":"...","subj":"m"|"p"|"c"|null}   (planner block, 24h)
{"do":"move_block","block":"title of existing block","date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM"}
{"do":"delete_block","block":"title of existing block"}
{"do":"focus","minutes":50,"label":"what","subj":"m"|"p"|"c"|null}
{"do":"stop_focus"}
{"do":"marks","pt":14,"kind":"mains"|"adv","m":72,"p":58,"c":66}   (omit subjects not given)
{"do":"potion"}
{"do":"open","screen":"home"|"tasks"|"study"|"tests"|"store"|"you"|"radar"}
Rules: "in 20 minutes" means now plus 20 minutes. A bare hour like "at 7" means the next 7 o'clock that hasn't passed (use sense: "wake me at 6" is morning). The app day resets at 3 AM. If he only asks a question, answer it in "say" from the data with no actions. If something is unclear, ask a short question in "say" with no actions. Never invent tasks or marks he didn't mention. You are not a general chatbot: for unrelated questions, give a one-line answer.`;

function arkData(c) {
  const s = state;
  const d = new Date(c.now);
  const plan = (day) => s.plan.filter((b) => (b.repeat === 'once' ? b.date === day : b.days?.[E.parseKey(day).getDay()])).map((b) => `${b.start}-${b.end} ${b.title}`).join('; ') || 'nothing';
  const tomorrow = E.addDays(c.today, 1);
  return [
    `Now: ${localIso(d)} (${d.toLocaleDateString('en-IN', { weekday: 'long' })}). App day: ${c.today}.`,
    `Stats: level ${s.user.lvl}, health ${Math.round(s.user.hp)}/${E.MAX_HP}, gold ${s.user.gp.toFixed(1)}, XP ${Math.round(s.user.exp)}/${E.toNextLevel(s.user.lvl)}.`,
    c.b ? `Boss: ${c.b.name}, ${c.b.hp}/${c.b.maxHp} HP, fight ends ${c.b.end}.` : 'Boss: none this week.',
    `Dailies due today: ${c.due.map((x) => `${x.text}${x.completed ? ' (done)' : ''}`).join('; ') || 'none'}.`,
    `Open to-dos: ${c.todos.slice(0, 25).map((x) => `${x.text}${x.due ? ` (due ${x.due})` : ''}`).join('; ') || 'none'}.`,
    `Habits: ${s.tasks.filter((x) => x.type === 'habit').map((x) => x.text).join('; ') || 'none'}.`,
    `Plan today: ${plan(c.today)}. Plan tomorrow: ${plan(tomorrow)}.`,
    `Reminders: ${c.rem.map((r) => `${r.text} at ${localIso(new Date(r.at))}`).join('; ') || 'none'}.`,
    `Focus timer: ${s.focus.running ? `running, ${s.focus.running.minutes} min ${s.focus.running.kind}` : 'off'}. Default focus length ${s.settings.focusMinutes} min.`,
    c.nextPaper ? `Next paper: ${c.nextPaper.name} (PT-${c.nextPaper.n}) on ${c.nextPaper.date}.` : '',
    s.settings.examDate ? `${s.settings.examName}: ${s.settings.examDate}.` : '',
  ].filter(Boolean).join('\n');
}

async function arkThink(text, c) {
  const reply = await ask(state.settings, { system: ARK_SYSTEM, prompt: `${arkData(c)}\n\nSathwik said: "${text}"`, maxTokens: 700, json: true });
  const j = parseJson(reply);
  return { say: String(j.say || ''), actions: Array.isArray(j.actions) ? j.actions : [] };
}

const HHMM = /^\d{1,2}:\d{2}$/;
const fixHm = (x) => (HHMM.test(x || '') ? x.padStart(5, '0') : null);
const okDate = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || '') ? x : null);

// Carries out one action. Returns { ok, msg?, open? }.
function arkDo(a, c) {
  switch (a.do) {
    case 'remind': {
      const at = new Date(a.at).getTime();
      if (!at || Number.isNaN(at)) return { ok: false, msg: 'I couldn’t work out the time for that reminder.' };
      if (at <= now()) return { ok: false, msg: 'That time has already passed.' };
      const r = { id: uid(), nid: Math.floor(Math.random() * 99999), text: String(a.text || 'Reminder').slice(0, 120), at };
      setState((s) => ({ ...s, reminders: [...(s.reminders || []), r].sort((x, z) => x.at - z.at) }));
      return { ok: true, msg: `Reminder ${whenWords(at, now())}: ${r.text}` };
    }
    case 'cancel_reminder': {
      const r = bestMatch(String(a.text || ''), c.rem);
      if (!r) return { ok: false, msg: 'I couldn’t find that reminder.' };
      setState((s) => ({ ...s, reminders: s.reminders.filter((x) => x.id !== r.id) }));
      return { ok: true, msg: `Cancelled: ${r.text}` };
    }
    case 'add_task': {
      const type = ['todo', 'daily', 'habit'].includes(a.type) ? a.type : 'todo';
      const text = String(a.text || '').trim().slice(0, 120);
      if (!text) return { ok: false };
      const base = { id: uid(), type, text, notes: 'Added by Ark', priority: E.PRIORITY[a.priority] != null ? a.priority : 'easy', value: 0, createdAt: now(), checklist: [], tag: ['m', 'p', 'c'].includes(a.subj) ? a.subj : null };
      const task = type === 'habit' ? { ...base, up: true, down: false, countUp: 0, countDown: 0 }
        : type === 'daily' ? { ...base, frequency: 'weekly', days: [true, true, true, true, true, true, true], everyX: 1, startDate: today(), streak: 0, completed: false }
        : { ...base, due: okDate(a.due) || '', completed: false };
      saveTask(task);
      return { ok: true, msg: `Added ${type === 'todo' ? 'to-do' : type}: ${text}` };
    }
    case 'complete': {
      const pool = [...c.left, ...c.todos, ...state.tasks.filter((x) => x.type === 'habit' && x.up)];
      const t = bestMatch(String(a.task || ''), [...new Map(pool.map((x) => [x.id, x])).values()]);
      if (!t) return { ok: false, msg: `I couldn’t find an open task like “${a.task}”.` };
      if (t.type === 'habit') scoreHabit(t.id, 'up'); else toggleTask(t.id);
      return { ok: true, msg: `Ticked off: ${t.text}` };
    }
    case 'add_block': {
      const start = fixHm(a.start), end = fixHm(a.end), date = okDate(a.date) || today();
      if (!start || !end || !a.title) return { ok: false, msg: 'I need a start and end time for that block.' };
      saveBlock({ id: uid(), title: String(a.title).slice(0, 80), subj: ['m', 'p', 'c'].includes(a.subj) ? a.subj : null, start, end, repeat: 'once', date, days: [0, 1, 2, 3, 4, 5, 6].map(() => false), ai: true });
      return { ok: true, msg: `Planned ${a.title}, ${start}–${end}` };
    }
    case 'move_block':
    case 'delete_block': {
      const b = bestMatch(String(a.block || ''), state.plan, (x) => x.title);
      if (!b) return { ok: false, msg: `I couldn’t find a block called “${a.block}”.` };
      if (a.do === 'delete_block') { setState((s) => ({ ...s, plan: s.plan.filter((x) => x.id !== b.id) })); return { ok: true, msg: `Removed ${b.title}` }; }
      const start = fixHm(a.start) || b.start, end = fixHm(a.end) || b.end;
      saveBlock({ ...b, start, end, ...(b.repeat === 'once' ? { date: okDate(a.date) || b.date } : {}) });
      return { ok: true, msg: `Moved ${b.title} to ${start}–${end}` };
    }
    case 'focus': {
      if (state.focus.running) return { ok: false, msg: 'A timer is already running.' };
      const min = Math.max(5, Math.min(180, Math.round(Number(a.minutes) || state.settings.focusMinutes || 50)));
      const subj = ['m', 'p', 'c'].includes(a.subj) ? a.subj : 'm';
      startFocus(min, String(a.label || SUBJ_NAME[subj]).slice(0, 60), subj);
      scheduleFocusEnd({ start: now(), minutes: min, kind: 'focus' });
      return { ok: true, msg: `Focus: ${min} minutes`, open: 'study:focus' };
    }
    case 'stop_focus': {
      if (!state.focus.running) return { ok: false, msg: 'No timer is running.' };
      stopFocus(false); scheduleFocusEnd(null);
      return { ok: true, msg: 'Timer stopped' };
    }
    case 'marks': {
      const pt = state.pts.find((p) => p.n === Number(a.pt));
      const kind = a.kind === 'adv' ? 'adv' : 'mains';
      const paper = pt?.papers.find((p) => p.kind === kind);
      if (!paper) return { ok: false, msg: `I couldn’t find PT-${a.pt}.` };
      const scores = { ...paper.scores };
      ['m', 'p', 'c'].forEach((k) => { const v = Number(a[k]); if (a[k] != null && Number.isFinite(v)) scores[k] = v; });
      updatePaper(pt.id, paper.id, { scores });
      return { ok: true, msg: `${paper.name}: ${['m', 'p', 'c'].map((k) => `${SUBJ_NAME[k]} ${scores[k] ?? '–'}`).join(', ')}`, open: 'tests' };
    }
    case 'potion':
      return drinkPotion() ? { ok: true, msg: 'Drank a Health Potion' } : { ok: false, msg: state.user.hp >= E.MAX_HP ? 'Health is already full.' : 'Not enough gold for a potion.' };
    case 'open':
      return { ok: true, open: a.screen };
    default:
      return { ok: false };
  }
}

// Runs one thing Sathwik said. Returns { say, done: [msg], failed: [msg], via, open }.
export async function runArk(text) {
  const c = arkContext();
  let res = null;
  let via = 'Offline';
  let note = '';
  if (hasBrain(state.settings) && navigator.onLine !== false) {
    try { res = await arkThink(text, c); via = brainLabel(state.settings); }
    catch (e) { note = e.message; res = parseOffline(text, c); }
  } else res = parseOffline(text, c);
  if (!res) {
    return { say: note || 'I didn’t get that. Try “remind me at 9 to call Rahul”, “add a to-do …” or “start 50 minutes of physics”.', done: [], failed: [], via };
  }
  const snap = snapshot();
  const done = [], failed = [];
  let open = null;
  res.actions.slice(0, 8).forEach((a) => {
    try {
      const r = arkDo(a, arkContext());
      if (r.open) open = r.open;
      if (r.ok && r.msg) done.push(r.msg);
      if (!r.ok && r.msg) failed.push(r.msg);
    } catch (e) { failed.push(String(e.message || e)); }
  });
  let say = res.say;
  if (failed.length) say = failed.join(' ');
  else if (!say) say = done.length ? `${done.join('. ')}.` : 'Done.';
  if (done.length) {
    sfx.chime(); haptic('success');
    offerUndo('Ark made changes', snap);
  }
  return { say, done, failed, via: note && via === 'Offline' ? 'Offline (AI unreachable)' : via, open };
}

export function cancelReminder(id) {
  setState((s) => ({ ...s, reminders: (s.reminders || []).filter((r) => r.id !== id) }));
}
export function syncArkReminders() { return scheduleArkReminders(state.reminders || []); }
export function requestArk(listen = true) { setState((s) => ({ ...s, arkOpen: { at: now(), listen } }), { save: false }); }
export function closeArk() { setState((s) => ({ ...s, arkOpen: null }), { save: false }); }
