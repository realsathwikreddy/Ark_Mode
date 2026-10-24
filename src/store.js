import { useEffect, useState } from 'preact/hooks';
import { Preferences } from '@capacitor/preferences';
import * as E from './engine.js';
import { seedPTs, seedBacklog, seedTasks, seedRewards } from './seed.js';

const KEY = 'arkmode-state-v1';
let state = null;
const listeners = new Set();
let saveTimer = null;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const now = () => Date.now();
export const today = () => E.dayKey(now(), state?.settings?.dayStart ?? 3);

function initialState() {
  const t = E.dayKey(now(), 3);
  return {
    version: 1,
    user: { hp: 50, exp: 0, lvl: 1, gp: 0, deaths: 0 },
    settings: { name: 'John', dayStart: 3, restMode: false, reminders: true, reminderTime: '22:00', examDate: '2027-01-22', examName: 'JEE Main, session 1', focusMinutes: 50, breakMinutes: 10 },
    tasks: seedTasks(t),
    rewards: seedRewards(),
    pts: seedPTs(),
    backlog: seedBacklog(),
    focus: { running: null, sessions: [] },
    history: {},
    lastCron: t,
    checkin: null,
    toasts: [],
  };
}

export async function loadState() {
  try {
    const { value } = await Preferences.get({ key: KEY });
    state = value ? { ...initialState(), ...JSON.parse(value), toasts: [] } : initialState();
    if (!value) persist();
  } catch {
    state = initialState();
  }
  return state;
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
export async function flush() {
  clearTimeout(saveTimer);
  if (!state) return;
  const { toasts, ...rest } = state;
  try { await Preferences.set({ key: KEY, value: JSON.stringify(rest) }); } catch (e) { console.error(e); }
}

export function getState() { return state; }

export function setState(updater, { save = true } = {}) {
  const next = typeof updater === 'function' ? updater(state) : updater;
  if (!next || next === state) return;
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

// ---------- toasts ----------
export function toast(text, tone = 'info') {
  const id = uid();
  setState((s) => ({ ...s, toasts: [...s.toasts, { id, text, tone }] }), { save: false });
  setTimeout(() => setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }), { save: false }), 2600);
}

function fmtGain(g) {
  const parts = [];
  if (g.exp) parts.push(`${g.exp > 0 ? '+' : ''}${g.exp} XP`);
  if (g.gp && Math.abs(g.gp) >= 0.01) parts.push(`${g.gp > 0 ? '+' : ''}${g.gp.toFixed(1)} gold`);
  if (g.hp) parts.push(`${g.hp} HP`);
  return parts.join('   ');
}

function announce(user, gain) {
  (user.events || []).forEach((e) => {
    if (e.kind === 'levelup') toast(`Level ${e.lvl}. Health refilled.`, 'level');
    if (e.kind === 'death') toast(`Out of health. Dropped to level ${e.lvl} and lost your gold.`, 'bad');
  });
  if (gain) {
    const t = fmtGain(gain);
    if (t) toast(t, gain.hp < 0 || gain.exp < 0 ? 'bad' : 'good');
  }
}

function cleanUser(u) {
  const { events, ...rest } = u;
  return rest;
}

function logDay(s, gain) {
  const k = today();
  const h = s.history[k] || {};
  return {
    ...s.history,
    [k]: { ...h, xp: (h.xp || 0) + (gain.exp || 0), gp: (h.gp || 0) + (gain.gp || 0), hpLost: (h.hpLost || 0) + Math.min(0, gain.hp || 0) },
  };
}

function applyResult(s, res, taskId) {
  announce(res.user, res.gain);
  return {
    ...s,
    user: cleanUser(res.user),
    tasks: taskId ? s.tasks.map((t) => (t.id === taskId ? res.task : t)) : s.tasks,
    history: logDay(s, res.gain),
  };
}

// ---------- task actions ----------
export function scoreHabit(id, dir) {
  setState((s) => {
    const t = s.tasks.find((x) => x.id === id);
    return applyResult(s, E.scoreHabit(s.user, t, dir), id);
  });
}

export function toggleTask(id) {
  setState((s) => {
    const t = s.tasks.find((x) => x.id === id);
    const res = t.completed ? E.uncompleteTask(s.user, t) : E.completeTask(s.user, t, now());
    return applyResult(s, res, id);
  });
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
  setState((s) => {
    const r = s.rewards.find((x) => x.id === id);
    const res = E.buyReward(s.user, r);
    if (!res) { toast(`You need ${(r.cost - s.user.gp).toFixed(1)} more gold.`, 'bad'); return s; }
    toast(`Bought: ${r.text}`, 'good');
    const k = today();
    const h = s.history[k] || {};
    return { ...s, user: cleanUser(res.user), history: { ...s.history, [k]: { ...h, spent: (h.spent || 0) + r.cost } } };
  });
}
export function saveReward(r) {
  setState((s) => ({ ...s, rewards: s.rewards.some((x) => x.id === r.id) ? s.rewards.map((x) => (x.id === r.id ? r : x)) : [...s.rewards, r] }));
}
export function deleteReward(id) {
  setState((s) => ({ ...s, rewards: s.rewards.filter((r) => r.id !== id) }));
}

// ---------- grants (focus, backlog, papers) ----------
export function grantReward(priority, scale = 1, why = '') {
  setState((s) => {
    const res = E.grant(s.user, priority, scale);
    announce(res.user, res.gain);
    if (why) toast(why, 'info');
    return { ...s, user: cleanUser(res.user), history: logDay(s, res.gain) };
  });
}

// ---------- day reset ----------
// On open/resume: if a new app-day started, ask about yesterday's open dailies first
// (like Habitica's "record yesterday's activity"), then run the reset.
export function checkDay() {
  const s = state;
  const t = today();
  if (!s.lastCron || s.lastCron >= t) return;
  if (s.checkin) return;
  const open = s.settings.restMode ? [] : E.openDailies(s.tasks, s.lastCron);
  if (open.length) {
    setState({ ...s, checkin: { day: s.lastCron, ids: open.map((d) => d.id) } });
  } else {
    finishCheckin([]);
  }
}

export function finishCheckin(doneIds) {
  setState((s0) => {
    let s = { ...s0, checkin: null };
    let user = s.user;
    const tasks = s.tasks.map((t) => {
      if (!doneIds.includes(t.id)) return t;
      const res = E.completeTask(user, t, now());
      user = res.user;
      return res.task;
    });
    s = { ...s, user: cleanUser(user), tasks };
    const { state: next, report } = E.runCron(s, today());
    if (report) {
      if (report.died) toast(`Out of health. Dropped to level ${next.user.lvl} and lost your gold.`, 'bad');
      else if (report.damage < 0) toast(`New day. Missed dailies cost ${Math.abs(report.damage)} HP.`, 'bad');
      else toast(report.rest ? 'New day. Rest mode kept your streaks safe.' : 'New day. No damage taken.', 'good');
    }
    return { ...next, user: cleanUser(next.user), lastReport: report };
  });
}

// ---------- settings ----------
export function setSetting(key, value) {
  setState((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
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
  let gained = false;
  const before = state.backlog.find((x) => x.id === id);
  const wasCleared = Object.values(before.stages).every(Boolean);
  setState((s) => ({
    ...s,
    backlog: s.backlog.map((b) => {
      if (b.id !== id) return b;
      gained = !b.stages[stage];
      return { ...b, stages: { ...b.stages, [stage]: !b.stages[stage] } };
    }),
  }));
  const b = state.backlog.find((x) => x.id === id);
  if (gained) {
    const cleared = Object.values(b.stages).every(Boolean);
    grantReward('hard', cleared ? 2 : 1, cleared ? `${b.chapter} cleared` : '');
  } else {
    grantReward('hard', wasCleared ? -2 : -1);
  }
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
  setState((s) => {
    const sessions = r.kind === 'focus' && elapsed >= 5 ? [...s.focus.sessions, { day: today(), min: elapsed, subj: r.subj, label: r.label }] : s.focus.sessions;
    const k = today();
    const h = s.history[k] || {};
    const history = r.kind === 'focus' && elapsed >= 5 ? { ...s.history, [k]: { ...h, focusMin: (h.focusMin || 0) + elapsed } } : s.history;
    return { ...s, history, focus: { running: null, sessions: sessions.slice(-500) } };
  });
  if (r.kind === 'focus' && elapsed >= 5) grantReward('easy', elapsed / 25, completed ? `${elapsed} minutes of focus logged` : `Stopped early: ${elapsed} minutes logged`);
  else if (r.kind === 'focus') toast('Under 5 minutes, so nothing was logged.', 'info');
}

// ---------- backup ----------
export function exportData() {
  const { toasts, checkin, ...rest } = state;
  return JSON.stringify({ app: 'arkmode', exportedAt: new Date().toISOString(), data: rest }, null, 1);
}
export function importData(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  if (!data.user || !Array.isArray(data.tasks)) throw new Error('This file is not an Ark Mode backup.');
  setState({ ...initialState(), ...data, toasts: [], checkin: null });
}
export function resetAll() {
  setState(initialState());
}
