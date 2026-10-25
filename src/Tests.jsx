import { useState } from 'preact/hooks';
import * as S from './store.js';
import { SUBJECTS, allChapters } from './seed.js';
import { Sheet, Icon, fmtDate, relDay } from './ui.jsx';

const MISTAKE_TYPES = [
  { key: 'silly', name: 'Silly mistake' },
  { key: 'concept', name: 'Concept gap' },
  { key: 'calc', name: 'Calculation' },
  { key: 'time', name: 'Ran out of time' },
  { key: 'skipped', name: "Didn't attempt" },
  { key: 'misread', name: 'Misread question' },
];
const typeName = (k) => MISTAKE_TYPES.find((t) => t.key === k)?.name || k;
const SUBJ_NAME = { m: 'Maths', p: 'Physics', c: 'Chemistry' };

export function paperTotal(p) {
  const vals = SUBJECTS.map((s) => p.scores[s.key]);
  if (vals.some((v) => v === null || v === '' || Number.isNaN(v))) return null;
  const maxes = SUBJECTS.map((s) => p.max[s.key]);
  const score = vals.reduce((a, b) => a + Number(b), 0);
  const max = maxes.every((m) => m) ? maxes.reduce((a, b) => a + Number(b), 0) : null;
  return { score, max, pct: max ? (score / max) * 100 : null };
}
const subjPct = (p, k) => (p.scores[k] === null || p.scores[k] === '' || !p.max[k] ? null : (Number(p.scores[k]) / Number(p.max[k])) * 100);

export function TestsScreen({ state }) {
  const [kind, setKind] = useState('mains');
  const [open, setOpen] = useState(null);
  const today = S.today();
  const papers = state.pts.flatMap((pt) => pt.papers.filter((p) => p.kind === kind).map((p) => ({ ...p, n: pt.n, ptId: pt.id })));
  const scored = papers.filter((p) => paperTotal(p)?.pct != null).sort((a, b) => a.date.localeCompare(b.date));
  const next = state.pts.find((pt) => pt.papers.some((p) => p.date >= today));
  const [editTargets, setEditTargets] = useState(false);
  const targets = state.settings.targets?.[kind] || { m: null, p: null, c: null };
  const hasTargets = SUBJECTS.some((s) => targets[s.key]);

  return (
    <>
      <div class="section-head"><h1>Part tests</h1></div>
      <div class="seg">
        <button class={kind === 'mains' ? 'on' : ''} onClick={() => setKind('mains')}>Mains papers</button>
        <button class={kind === 'adv' ? 'on' : ''} onClick={() => setKind('adv')}>Advanced papers</button>
      </div>

      <div class="spread small" style="margin:-2px 0 12px">
        <span class="muted">{hasTargets ? `Targets: ${SUBJECTS.map((s) => `${s.short} ${targets[s.key] ? targets[s.key] + '%' : '—'}`).join(', ')}` : `No ${kind === 'mains' ? 'Mains' : 'Advanced'} targets set`}</span>
        <button class="link" onClick={() => setEditTargets(true)}>{hasTargets ? 'Edit targets' : 'Set targets'}</button>
      </div>

      <div class="section">
        {scored.length === 0 ? (
          <div class="empty"><p>No {kind === 'mains' ? 'Mains' : 'Advanced'} scores yet. Open a PT below and enter your marks to start the trend.</p></div>
        ) : (
          <>
            <Summary scored={scored} />
            <div class="card" style="margin-top:8px"><TrendChart key={kind} scored={scored} targets={targets} /></div>
          </>
        )}
      </div>

      <WeakChapters pts={state.pts} />

      <div class="section">
        <div class="section-head"><h2>Schedule</h2><span class="small muted">Mains on Saturday, Advanced on Sunday</span></div>
        {state.pts.map((pt) => {
          const m = pt.papers.find((p) => p.kind === 'mains');
          const a = pt.papers.find((p) => p.kind === 'adv');
          const mt = m && paperTotal(m);
          const at = a && paperTotal(a);
          const isNext = next && next.id === pt.id;
          const first = pt.papers[0]?.date;
          return (
            <button key={pt.id} class={`pt ${isNext ? 'pt-next' : ''}`} onClick={() => setOpen(pt.id)}>
              <span class="pt-n">PT-{pt.n}</span>
              <span class="grow">
                <span class="score-pill" style="display:block">
                  {mt ? `Mains ${fmtNum(mt.score)}${mt.max ? '/' + mt.max : ''}` : 'Mains —'}
                  {'   '}
                  {at ? `Adv ${fmtNum(at.score)}${at.max ? '/' + at.max : ''}` : 'Adv —'}
                </span>
                <span class="small muted">{fmtDate(first)}{isNext ? ` (${relDay(first, today)})` : ''}: {[...pt.syllabus.m.slice(0, 1), ...pt.syllabus.p.slice(0, 1), ...pt.syllabus.c.slice(0, 1)].join(', ')}</span>
              </span>
            </button>
          );
        })}
      </div>
      {editTargets && <TargetsSheet kind={kind} targets={targets} onClose={() => setEditTargets(false)} />}
      {open && <PTSheet pt={state.pts.find((p) => p.id === open)} pts={state.pts} onClose={() => setOpen(null)} />}
    </>
  );
}

const fmtNum = (n) => (Number.isInteger(n) ? n : n.toFixed(1));

function Summary({ scored }) {
  const last = scored[scored.length - 1];
  const prev = scored[scored.length - 2];
  const lt = paperTotal(last);
  const best = scored.reduce((b, p) => (paperTotal(p).pct > paperTotal(b).pct ? p : b), scored[0]);
  const recent = scored.slice(-3);
  const avg = recent.reduce((a, p) => a + paperTotal(p).pct, 0) / recent.length;
  const change = prev ? lt.pct - paperTotal(prev).pct : null;
  return (
    <div class="stat-grid">
      <div class="stat"><div class="stat-v">{lt.pct.toFixed(1)}%</div><div class="stat-l">{last.name}: {fmtNum(lt.score)}/{lt.max}</div></div>
      <div class="stat"><div class="stat-v">{change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}`}</div><div class="stat-l">{prev ? `Change vs ${prev.name}` : 'Change vs previous'}</div></div>
      <div class="stat"><div class="stat-v">{avg.toFixed(1)}%</div><div class="stat-l">Average of last {recent.length}</div></div>
      <div class="stat"><div class="stat-v">{paperTotal(best).pct.toFixed(1)}%</div><div class="stat-l">Best: {best.name}</div></div>
    </div>
  );
}

// Line chart: % per subject across papers, one axis, direct labels + legend, tap a column for values.
function TrendChart({ scored, targets = {} }) {
  const [sel, setSel] = useState(scored.length - 1);
  const W = 340, H = 190, L = 30, R = 26, T = 12, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const vals = [...scored.flatMap((p) => SUBJECTS.map((s) => subjPct(p, s.key)).filter((v) => v != null)), ...SUBJECTS.map((s) => targets[s.key]).filter(Boolean)];
  const lo = Math.min(0, Math.floor(Math.min(...vals) / 10) * 10);
  const hi = 100;
  const x = (i) => L + (scored.length === 1 ? iw / 2 : (i / (scored.length - 1)) * iw);
  const y = (v) => T + ih - ((v - lo) / (hi - lo)) * ih;
  const ticks = [];
  for (let v = lo; v <= hi; v += lo < 0 ? 20 : 25) ticks.push(v);
  const selP = scored[Math.min(sel, scored.length - 1)];
  const step = scored.length > 1 ? iw / (scored.length - 1) : iw;

  return (
    <>
      <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Score trend by subject">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" stroke-width="1" />
            <text x={L - 6} y={y(v) + 4} font-size="10" fill="var(--faint)" text-anchor="end">{v}</text>
          </g>
        ))}
        {labelYs(SUBJECTS.filter((s) => targets[s.key]).map((s) => ({ s, y: y(targets[s.key]) }))).map(({ s, y: ty, ly }) => (
          <g key={`t${s.key}`}>
            <line x1={L} x2={W - R} y1={ty} y2={ty} stroke={`var(--s-${s.key})`} stroke-width="1.2" stroke-dasharray="5 4" opacity=".75" />
            <text x={W - R + 4} y={ly + 3.5} font-size="10" fill={`var(--s-${s.key})`}>{s.short}</text>
          </g>
        ))}
        <line x1={x(sel)} x2={x(sel)} y1={T} y2={T + ih} stroke="var(--muted)" stroke-width="1" stroke-dasharray="3 3" />
        {SUBJECTS.map((s) => {
          const pts = scored.map((p, i) => [i, subjPct(p, s.key)]).filter(([, v]) => v != null);
          const d = pts.map(([i, v], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={`var(--s-${s.key})`} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
              {pts.map(([i, v]) => <circle key={i} cx={x(i)} cy={y(v)} r={i === sel ? 4.5 : 3} fill={`var(--s-${s.key})`} stroke="var(--surface)" stroke-width="2" />)}
            </g>
          );
        })}
        {scored.map((p, i) => (
          <g key={p.id}>
            {(scored.length <= 8 || i % Math.ceil(scored.length / 8) === 0 || i === scored.length - 1) && (
              <text x={x(i)} y={H - 8} font-size="10" fill={i === sel ? 'var(--text)' : 'var(--faint)'} text-anchor="middle">{p.n}</text>
            )}
            <rect x={x(i) - step / 2} y={T} width={step} height={ih + B} fill="transparent" onClick={() => setSel(i)} />
          </g>
        ))}
      </svg>
      <div class="spread small" style="margin-top:4px">
        <b>{selP.name}, {fmtDate(selP.date)}</b>
        <span class="muted">{paperTotal(selP).pct.toFixed(1)}% overall</span>
      </div>
      {SUBJECTS.some((s) => targets[s.key]) && <div class="small muted" style="margin-top:2px">Dashed lines are your targets.</div>}
      <div class="legend">
        {SUBJECTS.map((s) => {
          const v = subjPct(selP, s.key);
          const t = targets[s.key];
          const hit = t && v != null && v >= t;
          return <span key={s.key}><i class={`subj-dot dot-${s.key}`} />{s.name} {v == null ? '—' : `${v.toFixed(0)}% (${fmtNum(Number(selP.scores[s.key]))}/${selP.max[s.key]})`}{t ? <b class={hit ? 'hit-target' : ''} style={hit ? '' : 'color:var(--faint);font-weight:400'}>{hit ? ' on target' : ` / ${t}%`}</b> : null}</span>;
        })}
      </div>
    </>
  );
}

// Spread target labels so they never sit on top of each other.
function labelYs(items, gap = 11) {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  sorted.forEach((it, i) => { it.ly = i && it.y - sorted[i - 1].ly < gap ? sorted[i - 1].ly + gap : it.y; });
  return sorted;
}

function TargetsSheet({ kind, targets, onClose }) {
  const [t, setT] = useState({ ...targets });
  const save = () => {
    SUBJECTS.forEach((s) => S.setTarget(kind, s.key, t[s.key] === '' || t[s.key] == null ? null : Math.max(0, Math.min(100, Number(t[s.key])))));
    onClose();
  };
  return (
    <Sheet title={`${kind === 'mains' ? 'Mains' : 'Advanced'} targets`} onClose={onClose}
      actions={<button class="btn" onClick={save}>Save targets</button>}>
      <p class="small muted" style="margin:-6px 0 14px">The percentage you're aiming for in each subject. They show as dashed lines on the chart. Leave one blank to skip it.</p>
      {SUBJECTS.map((s) => (
        <label key={s.key} class="field">
          <span class="row" style="gap:8px"><i class={`subj-dot dot-${s.key}`} />{s.name} (%)</span>
          <input class="input" type="number" inputMode="decimal" min="0" max="100" value={t[s.key] ?? ''} placeholder="e.g. 70" onInput={(e) => setT({ ...t, [s.key]: e.target.value })} />
        </label>
      ))}
    </Sheet>
  );
}

function WeakChapters({ pts }) {
  const lost = {};
  const byType = {};
  pts.forEach((pt) => pt.papers.forEach((p) => p.mistakes.forEach((m) => {
    const k = `${m.subj}|${m.chapter}`;
    lost[k] = (lost[k] || 0) + (Number(m.marks) || 0);
    byType[m.type] = (byType[m.type] || 0) + (Number(m.marks) || 0);
  })));
  const rows = Object.entries(lost).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!rows.length) return null;
  const top = rows[0][1] || 1;
  const types = Object.entries(byType).sort((a, b) => b[1] - a[1]);
  const totalLost = types.reduce((a, [, v]) => a + v, 0);
  return (
    <div class="section">
      <div class="section-head"><h2>Where marks go</h2><span class="small muted">from your mistake log</span></div>
      <div class="card">
        <div class="weak">
          {rows.map(([k, v]) => {
            const [subj, chapter] = k.split('|');
            return [
              <span key={k + 'n'} class="row" style="gap:8px"><i class={`subj-dot dot-${subj}`} />{chapter}</span>,
              <span key={k + 'v'} class="muted" style="font-variant-numeric:tabular-nums">{v} marks</span>,
              <div key={k + 'b'} class="weak-bar"><div style={`width:${(v / top) * 100}%;background:var(--s-${subj})`} /></div>,
            ];
          })}
        </div>
        <p class="small muted" style="margin:6px 0 0">
          {types.map(([t, v]) => `${typeName(t)} ${Math.round((v / totalLost) * 100)}%`).join(', ')}
        </p>
      </div>
    </div>
  );
}

function PTSheet({ pt, pts, onClose }) {
  return (
    <Sheet title={`PT-${pt.n}`} onClose={onClose}>
      <p class="small muted" style="margin:-8px 0 12px">Taught {fmtDate(pt.teach[0])} to {fmtDate(pt.teach[1])}</p>
      <div class="card" style="margin-bottom:14px">
        {SUBJECTS.map((s) => (
          <div key={s.key} class="row" style="align-items:flex-start;margin-bottom:6px;font-size:14px">
            <i class={`subj-dot dot-${s.key}`} style="margin-top:7px" />
            <span><b>{s.name}:</b> {pt.syllabus[s.key].join(', ')}</span>
          </div>
        ))}
      </div>
      {pt.papers.map((p, i) => <PaperCard key={p.id} pt={pt} pts={pts} paper={p} extra={i > 1} />)}
      <div class="row" style="margin-top:4px">
        <button class="btn ghost small" onClick={() => S.addPaper(pt.id, 'mains')}>Add Mains paper</button>
        <button class="btn ghost small" onClick={() => S.addPaper(pt.id, 'adv')}>Add Advanced paper</button>
      </div>
    </Sheet>
  );
}

function lastAdvMax(pts) {
  const all = pts.flatMap((pt) => pt.papers).filter((p) => p.kind === 'adv' && p.max.m && p.max.p && p.max.c);
  return all.sort((a, b) => b.date.localeCompare(a.date))[0]?.max;
}

function PaperCard({ pt, pts, paper, extra }) {
  const [adding, setAdding] = useState(false);
  const upd = (patch) => S.updatePaper(pt.id, paper.id, patch);
  const total = paperTotal(paper);

  const setScore = (k, v) => {
    const scores = { ...paper.scores, [k]: v === '' ? null : Number(v) };
    let max = paper.max;
    if (paper.kind === 'adv' && !max[k]) max = { ...max, ...(lastAdvMax(pts) || {}) };
    const patch = { scores, max };
    const done = SUBJECTS.every((s) => scores[s.key] !== null);
    if (done && !paper.rewarded) { patch.rewarded = true; S.grantReward('medium', 1, `${paper.name} logged`); }
    upd(patch);
  };

  return (
    <div class="paper">
      <div class="spread" style="margin-bottom:12px">
        <div>
          <input class="input" style="padding:4px 8px;font-weight:700;width:150px;background:none;border-color:transparent" value={paper.name} onInput={(e) => upd({ name: e.target.value })} aria-label="Paper name" />
          <div class="small muted" style="padding-left:8px">{paper.kind === 'mains' ? 'Mains model,' : 'Advanced model,'} <input type="date" class="input" style="display:inline;width:auto;padding:2px 6px;font-size:13px;background:none;border-color:transparent" value={paper.date} onInput={(e) => upd({ date: e.target.value })} aria-label="Paper date" /></div>
        </div>
        {total && <div style="text-align:right"><div class="stat-v" style="font-size:20px">{fmtNum(total.score)}{total.max ? `/${total.max}` : ''}</div>{total.pct != null && <div class="small muted">{total.pct.toFixed(1)}%</div>}</div>}
      </div>
      <div class="score-grid">
        <span class="small muted" />
        <span class="small muted" style="text-align:center">Marks</span>
        <span />
        <span class="small muted" style="text-align:center">Out of</span>
        {SUBJECTS.map((s) => [
          <span key={s.key + 'l'} class="row" style="gap:6px;font-size:14px"><i class={`subj-dot dot-${s.key}`} />{s.short}</span>,
          <input key={s.key + 'v'} class="input" type="number" inputMode="decimal" value={paper.scores[s.key] ?? ''} onChange={(e) => setScore(s.key, e.target.value)} aria-label={`${s.name} marks`} />,
          <span key={s.key + 's'} class="muted">/</span>,
          <input key={s.key + 'm'} class="input" type="number" inputMode="decimal" value={paper.max[s.key] ?? ''} onChange={(e) => upd({ max: { ...paper.max, [s.key]: e.target.value === '' ? null : Number(e.target.value) } })} aria-label={`${s.name} maximum`} />,
        ])}
      </div>
      <div class="row" style="margin-bottom:10px">
        <label class="field grow" style="margin:0">Rank
          <input class="input" value={paper.rank} onInput={(e) => upd({ rank: e.target.value })} placeholder="e.g. 42 / 380" />
        </label>
      </div>
      <label class="field">Note
        <input class="input" value={paper.note} onInput={(e) => upd({ note: e.target.value })} placeholder="What went right or wrong" />
      </label>

      <div class="spread"><h3>Mistakes</h3>{!adding && <button class="link" onClick={() => setAdding(true)}>Log a mistake</button>}</div>
      {paper.mistakes.length === 0 && !adding && <p class="small muted" style="margin:6px 0 0">Log each lost question with its chapter. The Tests screen totals them into your weak chapters.</p>}
      {paper.mistakes.map((m) => (
        <div key={m.id} class="mistake">
          <i class={`subj-dot dot-${m.subj}`} style="margin-top:7px" />
          <div class="grow">
            <div>{m.chapter} <span class="muted">· −{m.marks}</span></div>
            <div class="small muted">{typeName(m.type)}{m.note ? `: ${m.note}` : ''}</div>
          </div>
          <button class="link" aria-label="Delete mistake" onClick={() => upd({ mistakes: paper.mistakes.filter((x) => x.id !== m.id) })}><Icon name="trash" size={17} /></button>
        </div>
      ))}
      {adding && <MistakeForm pt={pt} pts={pts} onCancel={() => setAdding(false)} onAdd={(m) => { upd({ mistakes: [...paper.mistakes, m] }); setAdding(false); }} />}
      {extra && <div style="margin-top:12px"><button class="btn danger small" onClick={() => S.deletePaper(pt.id, paper.id)}>Remove this paper</button></div>}
    </div>
  );
}

function MistakeForm({ pt, pts, onAdd, onCancel }) {
  const [subj, setSubj] = useState('m');
  const own = pt.syllabus[subj];
  const others = allChapters(pts, subj).filter((c) => !own.includes(c));
  const [chapter, setChapter] = useState(own[0]);
  const [type, setType] = useState('silly');
  const [marks, setMarks] = useState(4);
  const [note, setNote] = useState('');
  const pickSubj = (k) => { setSubj(k); setChapter(pt.syllabus[k][0]); };
  return (
    <div style="border-top:1px solid var(--line);padding-top:12px;margin-top:8px">
      <div class="chips" style="margin-bottom:12px">
        {SUBJECTS.map((s) => <button key={s.key} class={`chip ${subj === s.key ? 'on' : ''}`} onClick={() => pickSubj(s.key)}>{s.name}</button>)}
      </div>
      <label class="field">Chapter
        <select class="input" value={chapter} onChange={(e) => setChapter(e.target.value)}>
          <optgroup label={`PT-${pt.n} syllabus`}>{own.map((c) => <option key={c}>{c}</option>)}</optgroup>
          <optgroup label="Other chapters">{others.map((c) => <option key={c}>{c}</option>)}<option>Other</option></optgroup>
        </select>
      </label>
      <label class="field">What went wrong
        <select class="input" value={type} onChange={(e) => setType(e.target.value)}>
          {MISTAKE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
      </label>
      <div class="row">
        <label class="field" style="width:110px">Marks lost
          <input class="input" type="number" inputMode="decimal" value={marks} onInput={(e) => setMarks(e.target.value)} />
        </label>
        <label class="field grow">Note
          <input class="input" value={note} onInput={(e) => setNote(e.target.value)} placeholder="Q14, forgot sign of work" />
        </label>
      </div>
      <div class="row">
        <button class="btn ghost small" onClick={onCancel}>Cancel</button>
        <button class="btn small" onClick={() => onAdd({ id: S.uid(), subj, chapter, type, marks: Number(marks) || 0, note: note.trim() })}>Add mistake</button>
      </div>
    </div>
  );
}

export { SUBJ_NAME };
