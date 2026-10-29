// Export PT scores and the mistake log as an Excel file (opens in Google Sheets too).
import * as XLSX from 'xlsx';
import { paperTotal } from './Tests.jsx';

const SUBJ = { m: 'Maths', p: 'Physics', c: 'Chemistry' };
const TYPES = { silly: 'Silly mistake', concept: 'Concept gap', calc: 'Calculation', time: 'Ran out of time', skipped: "Didn't attempt", misread: 'Misread question' };

export function buildWorkbook(state) {
  const papers = [];
  const mistakes = [];
  state.pts.forEach((pt) => pt.papers.forEach((p) => {
    const t = paperTotal(p);
    papers.push({
      PT: `PT-${pt.n}`, Paper: p.name, Model: p.kind === 'mains' ? 'Mains' : 'Advanced', Date: p.date,
      Maths: p.scores.m, 'Maths max': p.max.m, Physics: p.scores.p, 'Physics max': p.max.p, Chemistry: p.scores.c, 'Chemistry max': p.max.c,
      Total: t ? t.score : null, 'Total max': t ? t.max : null, Percent: t?.pct != null ? Math.round(t.pct * 10) / 10 : null,
      Rank: p.rank || '', Note: p.note || '',
    });
    p.mistakes.forEach((m) => mistakes.push({ PT: `PT-${pt.n}`, Paper: p.name, Date: p.date, Subject: SUBJ[m.subj], Chapter: m.chapter, Type: TYPES[m.type] || m.type, 'Marks lost': m.marks, Note: m.note || '' }));
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(papers);
  ws1['!cols'] = [6, 14, 9, 11, 7, 10, 8, 11, 10, 13, 7, 9, 8, 12, 30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws1, 'Papers');
  const ws2 = XLSX.utils.json_to_sheet(mistakes.length ? mistakes : [{ PT: '', Paper: '', Date: '', Subject: '', Chapter: '', Type: '', 'Marks lost': '', Note: '' }]);
  ws2['!cols'] = [6, 14, 11, 10, 26, 16, 10, 30].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws2, 'Mistakes');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}
