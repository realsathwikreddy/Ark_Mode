// Badges unlocked by what you actually do. Each test reads the whole state.
import * as E from './engine.js';

const SUBJ = ['m', 'p', 'c'];
const scored = (p) => SUBJ.every((k) => p.scores[k] !== null && p.scores[k] !== '');
const pct = (p) => {
  if (!scored(p) || !SUBJ.every((k) => p.max[k])) return null;
  const s = SUBJ.reduce((a, k) => a + Number(p.scores[k]), 0);
  const m = SUBJ.reduce((a, k) => a + Number(p.max[k]), 0);
  return (s / m) * 100;
};
const papers = (s) => s.pts.flatMap((pt) => pt.papers);
const bossWins = (s) => (s.bossHistory || []).filter((b) => b.result === 'defeated');
const focusSince = (s, days, today) => {
  const from = E.addDays(today, -(days - 1));
  return s.focus.sessions.filter((x) => x.day >= from).reduce((a, x) => a + x.min, 0);
};

export const ACHIEVEMENTS = [
  { id: 'first-step', icon: 'step', name: 'First step', desc: 'Finish your first task.', test: (s) => (s.stats?.tasksDone || 0) >= 1 },
  { id: 'clean-sweep', icon: 'check', name: 'Clean sweep', desc: 'Finish every daily due today (at least 2).', test: (s, t) => { const due = s.tasks.filter((x) => E.isDue(x, t)); return due.length >= 2 && due.every((x) => x.completed); } },
  { id: 'streak-7', icon: 'flame', name: 'Week unbroken', desc: 'Keep a daily going 7 days straight.', test: (s) => s.tasks.some((x) => (x.streak || 0) >= 7) },
  { id: 'streak-30', icon: 'flame', name: 'Month unbroken', desc: 'Keep a daily going 30 days straight.', test: (s) => s.tasks.some((x) => (x.streak || 0) >= 30) },
  { id: 'deep-work', icon: 'clock', name: 'Deep work', desc: 'Focus 10 hours within 7 days.', test: (s, t) => focusSince(s, 7, t) >= 600 },
  { id: 'fifty-hours', icon: 'clock', name: 'Fifty hours', desc: 'Log 50 hours of focus in total.', test: (s) => s.focus.sessions.reduce((a, x) => a + x.min, 0) >= 3000 },
  { id: 'giant-slayer', icon: 'sword', name: 'Giant slayer', desc: 'Defeat your first boss.', test: (s) => bossWins(s).length >= 1 },
  { id: 'warden-breaker', icon: 'crown', name: 'Boss hunter', desc: 'Defeat 3 bosses.', test: (s) => bossWins(s).length >= 3 },
  { id: 'untouched', icon: 'shield', name: 'Untouched', desc: 'Defeat a boss without it ever hitting you.', test: (s) => bossWins(s).some((b) => (b.hitsOnYou || 0) === 0) },
  { id: 'debt-paid', icon: 'book', name: 'Debt paid', desc: 'Clear a backlog chapter (all three stages).', test: (s) => s.backlog.some((b) => Object.values(b.stages).every(Boolean)) },
  { id: 'clean-slate', icon: 'star', name: 'Clean slate', desc: 'Clear your whole backlog.', test: (s) => s.backlog.length > 0 && s.backlog.every((b) => Object.values(b.stages).every(Boolean)) },
  { id: 'level-5', icon: 'up', name: 'Level 5', desc: 'Reach level 5.', test: (s) => s.user.lvl >= 5 },
  { id: 'level-10', icon: 'up', name: 'Level 10', desc: 'Reach level 10.', test: (s) => s.user.lvl >= 10 },
  { id: 'scorekeeper', icon: 'chart', name: 'Scorekeeper', desc: 'Log marks for 10 papers.', test: (s) => papers(s).filter(scored).length >= 10 },
  { id: 'error-hunter', icon: 'bug', name: 'Error hunter', desc: 'Log 25 mistakes.', test: (s) => papers(s).reduce((a, p) => a + p.mistakes.length, 0) >= 25 },
  { id: 'on-target', icon: 'target', name: 'On target', desc: 'Hit your target in all three subjects in one paper.', test: (s) => papers(s).some((p) => { const t = s.settings.targets?.[p.kind]; return t && scored(p) && SUBJ.every((k) => t[k] && p.max[k] && (Number(p.scores[k]) / p.max[k]) * 100 >= t[k]); }) },
  { id: 'climber', icon: 'chart', name: 'Climber', desc: 'Beat your previous Mains paper by 5 points of %.', test: (s) => { const m = papers(s).filter((p) => p.kind === 'mains' && pct(p) != null).sort((a, b) => a.date.localeCompare(b.date)); return m.some((p, i) => i > 0 && pct(p) - pct(m[i - 1]) >= 5); } },
];

// Returns ids that are newly earned.
export function newlyEarned(s, today) {
  const have = s.achievements || {};
  return ACHIEVEMENTS.filter((a) => !have[a.id] && safe(() => a.test(s, today))).map((a) => a.id);
}
function safe(f) { try { return !!f(); } catch { return false; } }

export const ICONS = {
  step: 'M6 18h4v-4h4v-4h4V6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  flame: 'M12 21c-3.3 0-6-2.4-6-5.6 0-3.4 3-5.4 3.6-8.4 1.8 1.4 2.4 3.2 2.4 4.6 1-.6 1.8-1.8 2-3 2 1.8 4 4.2 4 6.8C18 18.6 15.3 21 12 21z',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  sword: 'M14.5 4H20v5.5L9 20.5 3.5 15zM6 13l5 5M4 20l2.5-2.5',
  crown: 'M4 18h16M4 18 3 7l5 4 4-6 4 6 5-4-1 11',
  shield: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  up: 'M12 20V5M6 11l6-6 6 6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  bug: 'M9 9h6v8a3 3 0 0 1-6 0zM12 9V6M8 6l2 2M16 6l-2 2M5 13h4M15 13h4M6 18l3-1.5M18 18l-3-1.5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
};
