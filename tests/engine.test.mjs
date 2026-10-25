import assert from 'node:assert/strict';
import * as E from '../src/engine.js';

const user = () => ({ hp: 50, exp: 0, lvl: 1, gp: 0, deaths: 0, events: [] });
const daily = (o = {}) => ({ id: 'd', type: 'daily', text: 'd', priority: 'easy', value: 0, frequency: 'weekly', days: [1, 1, 1, 1, 1, 1, 1], streak: 0, completed: false, checklist: [], ...o });

// level curve
assert.equal(E.toNextLevel(1), 150);
assert.equal(E.toNextLevel(10), 260);

// 3 AM boundary
assert.equal(E.dayKey(new Date(2026, 9, 25, 2, 59).getTime()), '2026-10-24');
assert.equal(E.dayKey(new Date(2026, 9, 25, 3, 0).getTime()), '2026-10-25');

// habit up/down
let r = E.scoreHabit(user(), { type: 'habit', priority: 'easy', value: 0, up: true, down: true }, 'up');
assert.equal(r.user.exp, 6); assert.ok(Math.abs(r.user.gp - 1) < 1e-9); assert.ok(r.task.value > 0.99);
r = E.scoreHabit(user(), { type: 'habit', priority: 'hard', value: 0, up: true, down: true }, 'down');
assert.equal(r.user.hp, 46);

// red tasks pay more
assert.ok(E.taskDelta(-10, 'up') > E.taskDelta(10, 'up'));

// complete + undo is exact
const u0 = { ...user(), exp: 140, gp: 5 };
const c = E.completeTask(u0, daily({ priority: 'hard', value: -5 }));
assert.equal(c.user.lvl, 2); // crossed 150
const un = E.uncompleteTask(c.user, c.task);
assert.equal(un.user.lvl, 1); assert.equal(un.user.exp, 140); assert.equal(un.task.value, -5); assert.equal(un.task.streak, 0);

// cron: missed easy daily = -2 HP, streak reset; completed daily safe
let state = { user: user(), settings: { restMode: false }, tasks: [daily({ id: 'a', streak: 4 }), daily({ id: 'b', completed: true, streak: 2 })], lastCron: '2026-10-24', history: {} };
let out = E.runCron(state, '2026-10-25');
assert.equal(out.state.user.hp, 48);
assert.equal(out.state.tasks[0].streak, 0);
assert.equal(out.state.tasks[1].streak, 2);
assert.equal(out.state.tasks[1].completed, false);
assert.equal(out.report.missed.length, 1);

// away 5 days: damage once, value sinks 5 times
out = E.runCron({ ...state, tasks: [daily({ id: 'a' })] }, '2026-10-29');
assert.equal(out.state.user.hp, 48);
assert.ok(out.state.tasks[0].value < -4.5);

// not due (Sunday-only daily missed on a Saturday) = no damage
out = E.runCron({ ...state, tasks: [daily({ days: [1, 0, 0, 0, 0, 0, 0] })] }, '2026-10-25'); // 24 Oct 2026 is Saturday
assert.equal(out.state.user.hp, 50);

// rest mode
out = E.runCron({ ...state, settings: { restMode: true } }, '2026-10-25');
assert.equal(out.state.user.hp, 50); assert.equal(out.state.tasks[0].streak, 4);

// death
out = E.runCron({ ...state, user: { ...user(), hp: 1, lvl: 3, gp: 40 } }, '2026-10-25');
assert.equal(out.state.user.lvl, 2); assert.equal(out.state.user.gp, 0); assert.equal(out.state.user.hp, 50); assert.ok(out.report.died);

// checklist half done halves damage
out = E.runCron({ ...state, tasks: [daily({ checklist: [{ done: true }, { done: false }] })] }, '2026-10-25');
assert.equal(out.state.user.hp, 49);

// every-3-days daily
const e3 = daily({ frequency: 'every', everyX: 3, startDate: '2026-10-24' });
assert.ok(E.isDue(e3, '2026-10-27')); assert.ok(!E.isDue(e3, '2026-10-26'));

console.log('engine: all tests passed');

// ---------- bosses ----------
{
  const pts = [{ n: 13, papers: [{ kind: 'mains', date: '2026-10-31' }] }, { n: 14, papers: [{ kind: 'mains', date: '2026-11-07' }] }];
  assert.equal(E.bossPTFor(pts, '2026-10-25'), null);           // Sunday before: no boss yet
  assert.equal(E.bossPTFor(pts, '2026-10-26').n, 13);           // Monday: PT-13 boss
  assert.equal(E.bossPTFor(pts, '2026-10-31').n, 13);           // Saturday paper day: still on
  assert.equal(E.bossPTFor(pts, '2026-11-01'), null);           // Sunday after
  assert.equal(E.bossPTFor(pts, '2026-10-27', [13]), null);     // already fought
  assert.equal(E.bossDamage(1.5), 15);
  assert.equal(E.bossCounter([{ hp: -2 }, { hp: -0.4 }]), 2);   // 1 + 1 (min 1 each)
  const h = E.hurt({ hp: 3, exp: 10, lvl: 4, gp: 9 }, 5);
  assert.equal(h.lvl, 3); assert.equal(h.gp, 0); assert.equal(h.hp, 50);
  // a solid day (~9 gold) should take about a fifth of a level-1 boss
  const frac = E.bossDamage(9) / E.bossMaxHp(1);
  assert.ok(frac > 0.18 && frac < 0.22, `solid day = ${frac}`);
}
console.log('bosses: all tests passed');
