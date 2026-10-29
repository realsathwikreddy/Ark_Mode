// Time blocks you plan yourself. A block either repeats on chosen weekdays or is a one-off on a date.
// Times before the day-start hour (3 AM) belong to the previous app-day, like everything else.
import { parseKey } from './engine.js';

export const toMin = (hhmm) => { const [h, m] = (hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
export const fmtTime = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
};

export function blockOn(b, dayKey) {
  if (b.repeat === 'once') return b.date === dayKey;
  return !!(b.days || [])[parseKey(dayKey).getDay()];
}

// Minutes from the start of the app-day (so 1 AM sorts after 11 PM).
export function appMin(hhmm, dayStart = 3) {
  const m = toMin(hhmm);
  return m < dayStart * 60 ? m + 1440 : m;
}

export function blocksFor(plan, dayKey, dayStart = 3) {
  return plan.filter((b) => blockOn(b, dayKey)).sort((a, b) => appMin(a.start, dayStart) - appMin(b.start, dayStart));
}

export function blockRange(b, dayKey, dayStart = 3) {
  const base = parseKey(dayKey);
  base.setHours(0, 0, 0, 0);
  const s = appMin(b.start, dayStart);
  let e = appMin(b.end, dayStart);
  if (e <= s) e += 1440;
  return { start: base.getTime() + s * 60000, end: base.getTime() + e * 60000 };
}

// What's on now, and what's next, for the given moment.
export function nowAndNext(plan, dayKey, nowMs, dayStart = 3) {
  const list = blocksFor(plan, dayKey, dayStart).map((b) => ({ ...b, ...blockRange(b, dayKey, dayStart) }));
  const now = list.find((b) => nowMs >= b.start && nowMs < b.end) || null;
  const next = list.find((b) => b.start > nowMs) || null;
  return { now, next, list };
}
