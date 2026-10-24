// Starting data: the Narayana Co-Super Chaina (Model-A) revision schedule,
// shifted for Dussehra (PT-12 Mains on 24 Oct, Advanced on 25 Oct, then weekly).
// Each PT has a Saturday Mains paper (PTM) and a Sunday Advanced paper (PTA).
import { addDays } from './engine.js';

export const SUBJECTS = [
  { key: 'm', name: 'Maths', short: 'M' },
  { key: 'p', name: 'Physics', short: 'P' },
  { key: 'c', name: 'Chemistry', short: 'C' },
];

const SYLLABUS = [
  // [teaching start, teaching end, maths, physics, chemistry]
  ['2026-07-27', '2026-08-01', ['Statistics', 'Random variables'], ['Atomic physics & X-rays', 'Nuclear physics', 'Dual nature', 'Semiconductors'], ['Metallurgy', 'Hydrogen']],
  ['2026-08-03', '2026-08-08', ['Quadratic equations', 'Sequences & series', 'Logarithms'], ['Heat transfer', 'Calorimetry & thermal expansion'], ['Structure & IUPAC', 'Isomerism', 'GOC']],
  ['2026-08-10', '2026-08-15', ['Trigonometry & trig equations'], ['Heat & thermodynamics'], ['Hydrocarbons', 'Purification & characterisation']],
  ['2026-08-17', '2026-08-22', ['Matrices', 'Determinants'], ['Electrostatics & Gauss law', 'Gravitation'], ['Alkyl halides', 'Aryl halides', 'Polymers']],
  ['2026-08-24', '2026-08-29', ['Permutations & combinations'], ['Current electricity', 'Capacitors & RC circuits'], ['Alcohols', 'Phenols', 'Ethers']],
  ['2026-08-31', '2026-09-05', ['Probability'], ['Magnetism & matter'], ['Aldehydes & ketones', 'Carboxylic acids']],
  ['2026-09-07', '2026-09-12', ['Binomial theorem', 'Sets & relations'], ['EMI', 'AC & oscillations'], ['Amines', 'Biomolecules', 'Chemistry in everyday life']],
  ['2026-09-14', '2026-09-19', ['Complex numbers'], ['Ray optics'], ['Stoichiometry', 'Gaseous & liquid state']],
  ['2026-09-21', '2026-09-26', ['Functions', 'Inverse trig functions'], ['SHM', 'Error analysis & experiments'], ['Thermodynamics & thermochemistry']],
  ['2026-09-28', '2026-10-03', ['Limits & continuity', 'Derivatives'], ['Waves & sound'], ['Chemical & ionic equilibrium']],
  ['2026-10-05', '2026-10-10', ['Indefinite integration'], ['EM waves', 'Wave optics'], ['Chemical kinetics', 'Atomic structure']],
  ['2026-10-12', '2026-10-17', ['Definite integration'], ['Kinematics', 'NLM & friction'], ['Electrochemistry', 'Solid state']],
  ['2026-10-26', '2026-10-30', ['Area under curves', 'Differential equations'], ['Circular motion', 'Work, power & energy', 'Units & dimensions'], ['Solutions', 'Surface chemistry']],
  ['2026-11-02', '2026-11-06', ['Application of derivatives'], ['COM, momentum & collisions'], ['Periodic table', 'Chemical bonding']],
  ['2026-11-09', '2026-11-13', ['Straight lines', 'Circles'], ['Rotation I'], ['d & f block', 'Coordination compounds']],
  ['2026-11-16', '2026-11-20', ['Parabola', 'Ellipse & hyperbola'], ['Rotation II'], ['Qualitative analysis', 'Group 18']],
  ['2026-11-23', '2026-11-27', ['Vectors'], ['Fluids'], ['s-block', 'Group 13 & 14']],
  ['2026-11-30', '2026-12-04', ['Vectors', '3D geometry'], ['Elasticity', 'Surface tension & viscosity'], ['Group 15, 16 & 17']],
];

// Saturday of each PT week. PT-1..11 ran Sat before the scheduled Sunday; PT-12 moved to 24 Oct.
function mainsDate(n) {
  if (n <= 11) return addDays('2026-08-01', (n - 1) * 7);
  return addDays('2026-10-24', (n - 12) * 7);
}

const emptyScores = () => ({ m: null, p: null, c: null });

export function seedPTs() {
  return SYLLABUS.map(([start, end, m, p, c], i) => {
    const n = i + 1;
    const sat = mainsDate(n);
    return {
      id: `pt${n}`,
      n,
      teach: [start, end],
      syllabus: { m, p, c },
      papers: [
        { id: `pt${n}-m`, kind: 'mains', name: `PTM-${n}`, date: sat, scores: emptyScores(), max: { m: 100, p: 100, c: 100 }, rank: '', note: '', mistakes: [] },
        { id: `pt${n}-a`, kind: 'adv', name: `PTA-${n}`, date: addDays(sat, 1), scores: emptyScores(), max: { m: null, p: null, c: null }, rank: '', note: '', mistakes: [] },
      ],
    };
  });
}

export function allChapters(pts, subj) {
  const set = new Set();
  pts.forEach((pt) => (pt.syllabus[subj] || []).forEach((c) => set.add(c)));
  return [...set];
}

const BACKLOG = {
  m: ['Inverse trig functions', 'Trig ratios & identities', 'Trig equations', 'Matrices', 'Indefinite integration', 'Definite integration', 'Statistics'],
  p: ['Elasticity', 'Waves & sound', 'Current electricity'],
  c: ['Purification & characterisation', 'Hydrocarbons', 'Alkyl & aryl halides', 'Alcohols, phenols & ethers', 'Aldehydes & ketones', 'Carboxylic acids', 'Amines', 'Biomolecules'],
};

export const STAGES = [
  { key: 'theory', name: 'Theory' },
  { key: 'practice', name: 'Practice' },
  { key: 'pyq', name: 'PYQs' },
];

export function seedBacklog() {
  const out = [];
  Object.entries(BACKLOG).forEach(([subj, list]) =>
    list.forEach((chapter, i) => out.push({ id: `bl-${subj}-${i}`, subj, chapter, stages: { theory: false, practice: false, pyq: false } })),
  );
  return out;
}

const everyDay = [true, true, true, true, true, true, true];
const monSat = [false, true, true, true, true, true, true];

export function seedTasks(today) {
  return [
    { id: 'h1', type: 'habit', text: 'Solved a PYQ set', notes: '', priority: 'easy', value: 0, up: true, down: false, countUp: 0, countDown: 0, createdAt: Date.now() },
    { id: 'h2', type: 'habit', text: 'Picked up the phone while studying', notes: '', priority: 'easy', value: 0, up: false, down: true, countUp: 0, countDown: 0, createdAt: Date.now() },
    { id: 'd1', type: 'daily', text: "Revise today's class notes", notes: '', priority: 'medium', value: 0, frequency: 'weekly', days: monSat, everyX: 1, startDate: today, streak: 0, completed: false, checklist: [{ id: 'c1', text: 'Maths', done: false }, { id: 'c2', text: 'Physics', done: false }, { id: 'c3', text: 'Chemistry', done: false }], createdAt: Date.now() },
    { id: 'd2', type: 'daily', text: 'Log mistakes from the last paper', notes: '', priority: 'easy', value: 0, frequency: 'weekly', days: [true, false, false, false, false, false, false], everyX: 1, startDate: today, streak: 0, completed: false, checklist: [], createdAt: Date.now() },
    { id: 't1', type: 'todo', text: 'Enter PTM-12 marks', notes: 'Tests tab → PT-12', priority: 'easy', value: 0, due: today, completed: false, checklist: [], createdAt: Date.now() },
    { id: 't2', type: 'todo', text: 'Enter PTA-12 marks', notes: 'Tests tab → PT-12', priority: 'easy', value: 0, due: addDays(today, 1), completed: false, checklist: [], createdAt: Date.now() },
  ];
}

export function seedRewards() {
  return [
    { id: 'r1', text: '30 minutes of YouTube', notes: '', cost: 20 },
    { id: 'r2', text: 'One gaming session', notes: '', cost: 40 },
    { id: 'r3', text: 'Sunday night off', notes: '', cost: 150 },
  ];
}

export { everyDay };
