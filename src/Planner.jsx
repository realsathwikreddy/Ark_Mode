import { useEffect, useState } from 'preact/hooks';
import * as S from './store.js';
import * as E from './engine.js';
import { SUBJECTS } from './seed.js';
import { blocksFor, blockRange, fmtTime } from './planner.js';
import { Sheet, Icon, Fab, fmtDate, DAY_LETTERS } from './ui.jsx';
import { centerOf, float, burst } from './fx.js';
import { sfx } from './sfx.js';
import { haptic } from './native.js';

// Your own time blocks for the day. The one happening now glows; tick blocks off as you finish them.
export function Planner({ state, onFocus }) {
  const ds = state.settings.dayStart ?? 3;
  const today = S.today();
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const list = blocksFor(state.plan, day, ds);
  const done = state.planDone[day] || [];
  const nowMs = Date.now();
  const week = Array.from({ length: 7 }, (_, i) => E.addDays(today, i));

  const toggle = (b) => (e) => {
    const el = e.currentTarget;
    const was = done.includes(b.id);
    const gain = S.toggleBlock(day, b);
    const c = centerOf(el);
    if (!was) { sfx.tick(); haptic('light'); burst(c.x, c.y, `var(--s-${b.subj || 'm'})`, 16, 50); if (gain) float(c.x + 30, c.y - 24, `+${gain.exp} XP`); }
    else sfx.untick();
  };

  return (
    <div class="section">
      <div class="days-strip">
        {week.map((d) => (
          <button key={d} class={`day-pill ${d === day ? 'on' : ''}`} onClick={() => setDay(d)}>
            <span>{d === today ? 'Today' : DAY_LETTERS[E.parseKey(d).getDay()]}</span>
            <b>{E.parseKey(d).getDate()}</b>
            {blocksFor(state.plan, d, ds).length > 0 && <i class="day-dot" />}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div class="empty"><p>Nothing planned for {day === today ? 'today' : fmtDate(day, true)}. Add blocks like "6–7 PM: integration DPP" and they'll show up on the home screen when it's time.</p>
          <button class="btn small" onClick={() => setEditing(blank(day))}>Add a block</button></div>
      ) : (
        <div class="timeline">
          {list.map((b) => {
            const r = blockRange(b, day, ds);
            const live = day === today && nowMs >= r.start && nowMs < r.end;
            const past = day === today && nowMs >= r.end;
            const isDone = done.includes(b.id);
            const pct = live ? ((nowMs - r.start) / (r.end - r.start)) * 100 : 0;
            return (
              <div key={b.id} class={`block ${live ? 'live' : ''} ${past ? 'past' : ''} ${isDone ? 'done' : ''}`} style={`--bc:var(--s-${b.subj || 'none'}, var(--cy))`}>
                <div class="block-time"><b>{fmtTime(b.start)}</b><span>{fmtTime(b.end)}</span></div>
                <div class="block-body" onClick={() => setEditing(b)}>
                  <div class="block-title">{b.title}</div>
                  <div class="task-meta">
                    {b.subj && <span><i class={`subj-dot dot-${b.subj}`} /> {SUBJECTS.find((s) => s.key === b.subj).name}</span>}
                    {b.repeat === 'weekly' && <span>Repeats</span>}
                    {live && <span style="color:var(--cy)">Now</span>}
                  </div>
                  {live && <div class="rail" style="margin-top:8px"><div class="fill xp" style={`width:${pct}%`} /></div>}
                  {live && !isDone && <button class="link" style="margin-top:4px" onClick={(e) => { e.stopPropagation(); onFocus(b, Math.max(5, Math.round((r.end - nowMs) / 60000))); }}>Start focus for the rest of this block</button>}
                </div>
                <button class="tick" aria-label={isDone ? `Untick ${b.title}` : `Tick ${b.title}`} onClick={toggle(b)}>
                  <span class="box" style="--band:var(--bc)">{isDone && <Icon name="check" size={16} stroke={3} />}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
      <Fab label="Add block" onClick={() => setEditing(blank(day))} />
      {editing && <BlockEditor block={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function blank(day) {
  const d = E.parseKey(day).getDay();
  return { id: S.uid(), title: '', subj: null, start: '18:00', end: '19:00', repeat: 'once', date: day, days: [0, 1, 2, 3, 4, 5, 6].map((i) => i === d) };
}

function BlockEditor({ block, onClose }) {
  const [b, setB] = useState(block);
  const isNew = !S.getState().plan.some((x) => x.id === block.id);
  const set = (p) => setB({ ...b, ...p });
  const ok = b.title.trim() && b.start && b.end && b.start !== b.end && (b.repeat === 'once' || b.days.some(Boolean));
  return (
    <Sheet title={isNew ? 'New block' : 'Edit block'} onClose={onClose}
      actions={<>
        {!isNew && <button class="btn danger" onClick={() => { S.deleteBlock(b.id); onClose(); }}>Delete</button>}
        <button class="btn" disabled={!ok} onClick={() => { S.saveBlock({ ...b, title: b.title.trim() }); onClose(); }}>{isNew ? 'Add' : 'Save'}</button>
      </>}>
      <label class="field">What
        <input class="input" value={b.title} onInput={(e) => set({ title: e.target.value })} placeholder="Integration DPP" autoFocus />
      </label>
      <div class="row">
        <label class="field grow">From<input class="input" type="time" value={b.start} onInput={(e) => set({ start: e.target.value })} /></label>
        <label class="field grow">To<input class="input" type="time" value={b.end} onInput={(e) => set({ end: e.target.value })} /></label>
      </div>
      <div class="field"><span>Subject</span>
        <div class="chips">
          <button class={`chip ${!b.subj ? 'on' : ''}`} onClick={() => set({ subj: null })}>None</button>
          {SUBJECTS.map((s) => <button key={s.key} class={`chip ${b.subj === s.key ? 'on' : ''}`} onClick={() => set({ subj: s.key })}>{s.name}</button>)}
        </div>
      </div>
      <div class="field"><span>Repeat</span>
        <div class="chips">
          <button class={`chip ${b.repeat === 'once' ? 'on' : ''}`} onClick={() => set({ repeat: 'once' })}>Only {fmtDate(b.date, true)}</button>
          <button class={`chip ${b.repeat === 'weekly' ? 'on' : ''}`} onClick={() => set({ repeat: 'weekly' })}>Every week</button>
        </div>
      </div>
      {b.repeat === 'weekly' && (
        <div class="field"><span>On</span>
          <div class="days">
            {DAY_LETTERS.map((d, i) => <button key={i} class={`chip ${b.days[i] ? 'on' : ''}`} onClick={() => set({ days: b.days.map((v, j) => (j === i ? !v : v)) })}>{d}</button>)}
          </div>
        </div>
      )}
      <p class="small muted" style="margin:0 0 8px">You'll get a notification when the block starts, and it shows as "Now" on the home screen and widget.</p>
    </Sheet>
  );
}
