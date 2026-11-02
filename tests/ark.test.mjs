import assert from 'node:assert/strict';
import { parseOffline, parseClock, nextAt, bestMatch } from '../src/arkparse.js';
import { rankModels } from '../src/brain.js';

const now = new Date(2026, 10, 2, 22, 55).getTime(); // Mon 2 Nov, 10:55 PM
const ctx = { now, today: '2026-11-02', focusMinutes: 50, answers: { next: 'N', health: 'H', boss: 'B', gold: 'G', level: 'L', left: 'D', reminders: 'R', exam: 'E' } };
const P = (t) => parseOffline(t, ctx);
const at = (r) => r.actions[0].at;

assert.equal(at(P('remind me in 20 minutes to drink water')), '2026-11-02T23:15');
assert.equal(P('remind me in 20 minutes to drink water').actions[0].text, 'Drink water');
assert.equal(at(P('Remind me at 9:40 to call Rahul')), '2026-11-03T09:40'); // 9:40 PM passed, so 9:40 AM tomorrow
assert.equal(P('Remind me at 9:40 to call Rahul').actions[0].text, 'Call Rahul');
assert.equal(at(P('remind me to revise rotation at 11 pm')), '2026-11-02T23:00');
assert.equal(P('remind me to revise rotation at 11 pm').actions[0].text, 'Revise rotation');
assert.equal(at(P('remind me tomorrow at 5 to buy a notebook')), '2026-11-03T17:00');
assert.equal(at(P('wake me at 6 am')), '2026-11-03T06:00');
assert.equal(at(P('remind me in an hour to stretch')), '2026-11-02T23:55');
assert.equal(P('remind me to call mom').actions.length, 0);

let r = P('start 50 minutes of physics');
assert.deepEqual(r.actions[0], { do: 'focus', minutes: 50, subj: 'p', label: 'Physics' });
assert.equal(P('start a focus session').actions[0].minutes, 50);
assert.equal(P('stop the timer').actions[0].do, 'stop_focus');
assert.equal(P('drink a potion').actions[0].do, 'potion');

r = P('PT 14 mains maths 72 physics 58 chemistry 66');
assert.deepEqual(r.actions[0], { do: 'marks', pt: 14, kind: 'mains', m: 72, p: 58, c: 66 });
assert.equal(P('PTA-13 advanced maths 40 physics 31 chem 52').actions[0].kind, 'adv');

r = P('add a to-do revise wave optics tomorrow');
assert.equal(r.actions[0].type, 'todo'); assert.equal(r.actions[0].text, 'Revise wave optics'); assert.equal(r.actions[0].due, '2026-11-03');
assert.equal(P('add buy graph paper to my to-do list').actions[0].text, 'Buy graph paper');
assert.equal(P('add a habit called drink water').actions[0].type, 'habit');
assert.equal(P('mark physics notes as done').actions[0].task, 'physics notes');
assert.equal(P('open the tests').actions[0].screen, 'tests');
assert.equal(P("what's next").say, 'N');
assert.equal(P('how much health do I have').say, 'H');
assert.equal(P('blah blah'), null);

assert.equal(parseClock('9:40 pm').h, 21);
assert.equal(parseClock('12 am').h, 0);
assert.equal(nextAt(parseClock('7'), new Date(2026, 10, 2, 10, 0).getTime()).getHours(), 19);

const tasks = [{ text: "Revise today's class notes" }, { text: 'Enter PTM-12 marks' }, { text: 'Log mistakes from the last paper' }];
assert.equal(bestMatch('class notes', tasks).text, "Revise today's class notes");
assert.equal(bestMatch('ptm 12 marks', tasks).text, 'Enter PTM-12 marks');
assert.equal(bestMatch('chemistry homework', tasks), null);

assert.deepEqual(rankModels(['models/gemini-2.5-flash', 'models/gemini-3.8-flash', 'models/gemini-3.5-flash-lite', 'models/gemini-3.8-flash-image', 'models/gemini-4-argon', 'models/gemini-3.8-flash-tts']).slice(0, 3), ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash']);
console.log('ark: all tests passed');
