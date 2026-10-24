import { useEffect, useState } from 'preact/hooks';
import * as S from './store.js';
import { SUBJECTS, STAGES } from './seed.js';
import { Icon, Sheet } from './ui.jsx';
import { scheduleFocusEnd } from './native.js';

export function StudyScreen({ state }) {
  return (
    <>
      <div class="section-head"><h1>Study</h1></div>
      <Focus state={state} />
      <Backlog state={state} />
    </>
  );
}

function Focus({ state }) {
  const run = state.focus.running;
  const [, tick] = useState(0);
  const [mins, setMins] = useState(state.settings.focusMinutes || 50);
  const [subj, setSubj] = useState('m');

  useEffect(() => {
    if (!run) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [run]);

  const remaining = run ? Math.max(0, run.start + run.minutes * 60000 - Date.now()) : mins * 60000;
  useEffect(() => {
    if (run && remaining <= 0) {
      if (run.kind === 'focus') { S.stopFocus(true); scheduleFocusEnd(null); }
      else { S.stopFocus(true); scheduleFocusEnd(null); }
    }
  }, [run, remaining <= 0]);

  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);
  const total = run ? run.minutes * 60000 : mins * 60000;
  const frac = run ? 1 - remaining / total : 0;
  const R = 100, C = 2 * Math.PI * R;
  const ringColor = run?.kind === 'break' ? 'var(--xp)' : `var(--s-${run?.subj || subj})`;

  const today = S.today();
  const todayMin = state.focus.sessions.filter((x) => x.day === today).reduce((a, x) => a + x.min, 0);
  const bySubj = SUBJECTS.map((s) => ({ ...s, min: state.focus.sessions.filter((x) => x.day === today && x.subj === s.key).reduce((a, x) => a + x.min, 0) }));

  const start = () => {
    S.setSetting('focusMinutes', mins);
    S.startFocus(mins, SUBJECTS.find((s) => s.key === subj).name, subj);
    scheduleFocusEnd({ start: Date.now(), minutes: mins, kind: 'focus' });
  };
  const brk = () => {
    const b = state.settings.breakMinutes || 10;
    S.startBreak(b);
    scheduleFocusEnd({ start: Date.now(), minutes: b, kind: 'break' });
  };

  return (
    <div class="section">
      <div class="card timer">
        <div class="ring">
          <svg viewBox="0 0 220 220" width="220" height="220" aria-hidden="true">
            <circle cx="110" cy="110" r={R} fill="none" stroke="rgba(255,255,255,.06)" stroke-width="6" />
            <circle cx="110" cy="110" r={R} fill="none" stroke={ringColor} stroke-width="6" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} style="transition:stroke-dashoffset 1s linear" />
          </svg>
          <div>
            <div class="timer-face">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
            <div class="small muted" style="margin-top:6px">{run ? (run.kind === 'break' ? 'Break' : run.label) : 'Ready'}</div>
          </div>
        </div>

        {!run && (
          <>
            <div class="chips" style="justify-content:center;margin:10px 0">
              {SUBJECTS.map((s) => <button key={s.key} class={`chip ${subj === s.key ? 'on' : ''}`} onClick={() => setSubj(s.key)}>{s.name}</button>)}
            </div>
            <div class="chips" style="justify-content:center;margin-bottom:14px">
              {[25, 50, 90].map((m) => <button key={m} class={`chip ${mins === m ? 'on' : ''}`} onClick={() => setMins(m)}>{m} min</button>)}
            </div>
            <div class="row" style="justify-content:center">
              <button class="btn" onClick={start}>Start focus</button>
              <button class="btn ghost" onClick={brk}>Take a break</button>
            </div>
          </>
        )}
        {run && (
          <div class="row" style="justify-content:center;margin-top:12px">
            <button class="btn ghost" onClick={() => { S.stopFocus(false); scheduleFocusEnd(null); }}>{run.kind === 'break' ? 'End break' : 'Stop and log'}</button>
          </div>
        )}
        <p class="small muted" style="margin:14px 0 0">
          {todayMin ? `${Math.floor(todayMin / 60)}h ${todayMin % 60}m focused today: ${bySubj.filter((s) => s.min).map((s) => `${s.name} ${s.min}m`).join(', ')}` : 'Each 25 minutes of focus pays like an easy task. Keeps running if you switch apps.'}
        </p>
      </div>
    </div>
  );
}

function Backlog({ state }) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const items = state.backlog.filter((b) => filter === 'all' || b.subj === filter);
  const stagesDone = state.backlog.reduce((a, b) => a + Object.values(b.stages).filter(Boolean).length, 0);
  const stagesAll = state.backlog.length * STAGES.length;
  const cleared = state.backlog.filter((b) => Object.values(b.stages).every(Boolean)).length;

  return (
    <div class="section">
      <div class="section-head">
        <h2>Backlog</h2>
        <button class="link" onClick={() => setAdding(true)}>Add chapter</button>
      </div>
      {state.backlog.length > 0 && (
        <p class="small muted" style="margin:-4px 0 10px">{cleared} of {state.backlog.length} chapters cleared</p>
      )}
      <div class="chips" style="margin-bottom:10px">
        <button class={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
        {SUBJECTS.map((s) => <button key={s.key} class={`chip ${filter === s.key ? 'on' : ''}`} onClick={() => setFilter(s.key)}>{s.name}</button>)}
      </div>
      <div class="card">
        {items.length === 0 && <p class="muted small" style="margin:0">Nothing here. Add a chapter you still need to finish.</p>}
        {items.map((b) => (
          <div key={b.id} class="bl">
            <i class={`subj-dot dot-${b.subj}`} />
            <span class="grow" style={Object.values(b.stages).every(Boolean) ? 'color:var(--muted);text-decoration:line-through' : ''}>{b.chapter}</span>
            {STAGES.map((st) => (
              <button key={st.key} class={`stage ${b.stages[st.key] ? 'on' : ''}`} aria-pressed={b.stages[st.key]} onClick={() => S.toggleStage(b.id, st.key)}>{st.name}</button>
            ))}
          </div>
        ))}
        {stagesAll > 0 && <div class="progress-line"><div style={`width:${(stagesDone / stagesAll) * 100}%`} /></div>}
      </div>
      {adding && <AddChapter onClose={() => setAdding(false)} items={state.backlog} />}
    </div>
  );
}

function AddChapter({ onClose, items }) {
  const [subj, setSubj] = useState('m');
  const [name, setName] = useState('');
  const [mode, setMode] = useState('add');
  return (
    <Sheet title={mode === 'add' ? 'Add backlog chapter' : 'Remove chapters'} onClose={onClose}
      actions={mode === 'add' ? <><button class="btn ghost" onClick={() => setMode('remove')}>Remove instead</button><button class="btn" disabled={!name.trim()} onClick={() => { S.addBacklog(subj, name.trim()); onClose(); }}>Add</button></> : null}>
      {mode === 'add' ? (
        <>
          <div class="chips" style="margin-bottom:14px">
            {SUBJECTS.map((s) => <button key={s.key} class={`chip ${subj === s.key ? 'on' : ''}`} onClick={() => setSubj(s.key)}>{s.name}</button>)}
          </div>
          <label class="field">Chapter
            <input class="input" value={name} onInput={(e) => setName(e.target.value)} placeholder="Rotation" autoFocus />
          </label>
          <p class="small muted" style="margin:0 0 8px">Each stage you tick (theory, practice, PYQs) pays like a hard task. Clearing all three pays double on the last one.</p>
        </>
      ) : (
        items.map((b) => (
          <div key={b.id} class="bl">
            <i class={`subj-dot dot-${b.subj}`} /><span class="grow">{b.chapter}</span>
            <button class="link" aria-label={`Remove ${b.chapter}`} onClick={() => S.deleteBacklog(b.id)}><Icon name="trash" size={18} /></button>
          </div>
        ))
      )}
    </Sheet>
  );
}
