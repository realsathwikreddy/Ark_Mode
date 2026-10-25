// Game rules, modelled on Habitica's scoring (lite: no classes, bosses, pets or gear).
// Everything here is pure: functions take state and return a new copy or a result.

export const PRIORITY = { trivial: 0.1, easy: 1, medium: 1.5, hard: 2 };
export const PRIORITY_LABEL = { trivial: 'Trivial', easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const MAX_HP = 50;
const MIN_VALUE = -47.27;
const MAX_VALUE = 21.27;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

// XP needed to go from `lvl` to `lvl + 1` (Habitica's curve: 150 at level 1).
export function toNextLevel(lvl) {
  return Math.round((lvl * lvl * 0.25 + 10 * lvl + 139.75) / 10) * 10;
}

// How much a task's value moves on one score. Red (negative) tasks move further,
// so finally doing a neglected task pays more; blue tasks pay less.
export function taskDelta(value, direction) {
  const d = Math.pow(0.9747, clamp(value, MIN_VALUE, MAX_VALUE));
  return direction === 'down' ? -d : d;
}

// Colour band for a task's value, same thresholds as Habitica.
export function valueBand(value) {
  if (value < -20) return 'worst';
  if (value < -10) return 'worse';
  if (value < -1) return 'bad';
  if (value < 1) return 'neutral';
  if (value < 5) return 'good';
  if (value < 10) return 'better';
  return 'best';
}

// ---------- dates & the 3 AM day boundary ----------
const pad = (n) => String(n).padStart(2, '0');
export function keyOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return keyOf(d);
}
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}
// The "app day": before the day-start hour (3 AM) still counts as the previous day.
export function dayKey(ts, dayStart = 3) {
  const d = new Date(ts);
  d.setHours(d.getHours() - dayStart);
  return keyOf(d);
}

export function isDue(task, key) {
  if (task.type !== 'daily') return false;
  if (task.startDate && key < task.startDate) return false;
  if (task.frequency === 'every') {
    const n = Math.max(1, task.everyX || 1);
    const diff = daysBetween(task.startDate || key, key);
    return diff >= 0 && diff % n === 0;
  }
  const dow = parseKey(key).getDay(); // 0 = Sunday
  return !!(task.days || [])[dow];
}

// ---------- stats ----------
function applyLevels(user) {
  while (user.exp >= toNextLevel(user.lvl)) {
    user.exp -= toNextLevel(user.lvl);
    user.lvl += 1;
    user.hp = MAX_HP; // levelling up refills health, as in Habitica
    user.events.push({ kind: 'levelup', lvl: user.lvl });
  }
  while (user.exp < 0) {
    if (user.lvl <= 1) { user.exp = 0; break; }
    user.lvl -= 1;
    user.exp += toNextLevel(user.lvl);
  }
}

function applyDeath(user) {
  if (user.hp > 0) return;
  user.lvl = Math.max(1, user.lvl - 1);
  user.exp = 0;
  user.gp = 0;
  user.hp = MAX_HP;
  user.deaths = (user.deaths || 0) + 1;
  user.events.push({ kind: 'death', lvl: user.lvl });
}

function freshUser(user) {
  return { ...user, events: [] };
}

export function rewardFor(delta, priority, streak = 0) {
  const exp = Math.round(delta * priority * 6);
  const gpStreak = 1 + Math.min(streak, 100) / 100;
  const gp = delta * priority * gpStreak;
  return { exp, gp };
}

function checklistRatio(task) {
  const list = task.checklist || [];
  if (!list.length) return 0;
  return list.filter((c) => c.done).length / list.length;
}

// Score a habit (+ or −). Returns { user, task, gain }.
export function scoreHabit(user0, task0, direction) {
  const user = freshUser(user0);
  const task = { ...task0 };
  const p = PRIORITY[task.priority] ?? 1;
  const d = taskDelta(task.value, direction);
  task.value = round1000(task.value + d);
  let gain = { exp: 0, gp: 0, hp: 0 };
  if (direction === 'up') {
    const r = rewardFor(d, p);
    user.exp += r.exp; user.gp += r.gp;
    gain = { exp: r.exp, gp: r.gp, hp: 0 };
    task.countUp = (task.countUp || 0) + 1;
  } else {
    const hp = round1(d * p * 2);
    user.hp = round1(user.hp + hp);
    gain = { exp: 0, gp: 0, hp };
    task.countDown = (task.countDown || 0) + 1;
  }
  applyLevels(user);
  applyDeath(user);
  return { user, task, gain };
}

const round1000 = (v) => Math.round(v * 1000) / 1000;

// Tick a daily or to-do. Stores what was gained so un-ticking can give it back exactly.
export function completeTask(user0, task0, now = Date.now()) {
  const user = freshUser(user0);
  const task = { ...task0 };
  const p = PRIORITY[task.priority] ?? 1;
  const base = taskDelta(task.value, 'up');
  const bonus = 1 + checklistRatio(task);
  const streak = task.type === 'daily' ? (task.streak || 0) : 0;
  const r = rewardFor(base * bonus, p, streak);
  const undo = { value: task.value, streak: task.streak || 0, exp: r.exp, gp: r.gp };
  task.value = round1000(task.value + base);
  if (task.type === 'daily') task.streak = (task.streak || 0) + 1;
  task.completed = true;
  task.completedAt = now;
  task.undo = undo;
  user.exp += r.exp; user.gp += r.gp;
  applyLevels(user);
  return { user, task, gain: { exp: r.exp, gp: r.gp, hp: 0 } };
}

export function uncompleteTask(user0, task0) {
  const user = freshUser(user0);
  const task = { ...task0 };
  const u = task.undo;
  if (u) {
    task.value = u.value;
    if (task.type === 'daily') task.streak = u.streak;
    user.exp -= u.exp;
    user.gp = Math.max(0, user.gp - u.gp);
  }
  task.completed = false;
  task.completedAt = null;
  task.undo = null;
  applyLevels(user);
  return { user, task, gain: { exp: -(u?.exp || 0), gp: -(u?.gp || 0), hp: 0 } };
}

// A flat reward for things outside the task list (focus sessions, backlog stages, logging a paper).
export function grant(user0, priorityKey, scale = 1) {
  const user = freshUser(user0);
  const r = rewardFor(1 * scale, PRIORITY[priorityKey] ?? 1);
  user.exp += r.exp; user.gp += r.gp;
  applyLevels(user);
  return { user, gain: { exp: r.exp, gp: r.gp, hp: 0 } };
}

export function buyReward(user0, reward) {
  if (user0.gp < reward.cost) return null;
  const user = freshUser(user0);
  user.gp = round1000(user.gp - reward.cost);
  return { user };
}

// Dailies that were due on `key` and are still open — what the morning check-in asks about.
export function openDailies(tasks, key) {
  return tasks.filter((t) => t.type === 'daily' && isDue(t, key) && !t.completed);
}

// The day reset ("cron"). Runs once for every app-day boundary crossed since lastCron.
// - each daily that was due and left unticked hurts once (scaled by unfinished checklist)
//   and its value sinks once per missed due day (max 7)
// - rest mode: nothing hurts and streaks are kept
// - open to-dos slowly turn redder; one-direction habits drift back toward neutral
export function runCron(state, today) {
  const last = state.lastCron;
  if (!last || last >= today) return { state: { ...state, lastCron: today }, report: null };
  const user = freshUser(state.user);
  const rest = !!state.settings.restMode;
  const days = Math.min(daysBetween(last, today), 30);
  const missedDays = [];
  for (let i = 0; i < days; i++) missedDays.push(addDays(last, i));

  let damage = 0;
  const missed = [];
  const tasks = state.tasks.map((t0) => {
    const t = { ...t0 };
    if (t.type === 'daily') {
      if (!rest) {
        let misses = 0;
        missedDays.forEach((k, i) => {
          if (!isDue(t, k)) return;
          if (i === 0 && t.completed) return;
          misses += 1;
        });
        if (misses > 0) {
          const p = PRIORITY[t.priority] ?? 1;
          const d = taskDelta(t.value, 'down');
          const hit = round1(d * p * 2 * (1 - checklistRatio(t)));
          damage += hit;
          for (let m = 0; m < Math.min(misses, 7); m++) t.value = round1000(t.value + taskDelta(t.value, 'down'));
          t.streak = 0;
          missed.push({ id: t.id, text: t.text, hp: hit });
        }
      }
      t.completed = false;
      t.completedAt = null;
      t.undo = null;
      t.checklist = (t.checklist || []).map((c) => ({ ...c, done: false }));
    } else if (t.type === 'habit') {
      t.countUp = 0; t.countDown = 0;
      const oneWay = (t.up && !t.down) || (!t.up && t.down);
      if (oneWay && t.value !== 0) {
        for (let i = 0; i < days; i++) t.value = Math.abs(t.value) < 0.1 ? 0 : round1000(t.value / 2);
      }
    } else if (t.type === 'todo' && !t.completed && !rest) {
      for (let i = 0; i < Math.min(days, 7); i++) t.value = round1000(t.value + taskDelta(t.value, 'down'));
    }
    return t;
  });

  user.hp = round1(user.hp + damage);
  applyDeath(user);

  const history = { ...(state.history || {}) };
  const yday = missedDays[0];
  const dueYday = state.tasks.filter((t) => isDue(t, yday));
  history[yday] = {
    ...(history[yday] || {}),
    due: dueYday.length,
    done: dueYday.filter((t) => t.completed).length,
    hpLost: -damage,
    rest,
  };

  return {
    state: { ...state, user, tasks, history, lastCron: today },
    report: { day: yday, damage: round1(damage), missed, died: user.events.some((e) => e.kind === 'death'), rest, events: user.events },
  };
}

// ---------- damage from outside the normal score path (boss hits) ----------
export function hurt(user0, amount) {
  const user = { ...user0, events: [] };
  user.hp = round1(user.hp - Math.abs(amount));
  applyDeath(user);
  return user;
}

// ---------- weekly PT bosses ----------
// Each PT's boss is fought Monday → Saturday (the Mains paper day).
export const BOSS_DMG_PER_GOLD = 10;
export const BOSS_REWARD = { gp: 20, exp: 120 };
export function bossMaxHp(lvl) {
  return 450 + 25 * (Math.max(1, lvl) - 1);
}
export function bossWindow(pt) {
  const m = pt.papers.find((p) => p.kind === 'mains') || pt.papers[0];
  if (!m?.date) return null;
  return { start: addDays(m.date, -5), end: m.date };
}
// The PT whose boss should be active on `today`, skipping ones already fought.
export function bossPTFor(pts, today, foughtNs = []) {
  return pts.find((pt) => {
    if (foughtNs.includes(pt.n)) return false;
    const w = bossWindow(pt);
    return w && today >= w.start && today <= w.end;
  }) || null;
}
export function bossDamage(gp) {
  return Math.round(gp * BOSS_DMG_PER_GOLD);
}
// When you miss dailies, the boss hits you for half of each missed daily's damage (at least 1 each).
export function bossCounter(missed) {
  return round1(missed.reduce((a, m) => a + Math.max(1, Math.abs(m.hp) * 0.5), 0));
}
export function grantFlat(user0, gp, exp) {
  const user = { ...user0, events: [] };
  user.gp += gp; user.exp += exp;
  applyLevels(user);
  return user;
}
