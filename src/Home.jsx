import { useEffect, useState } from 'preact/hooks';
import * as S from './store.js';
import * as E from './engine.js';
import { nowAndNext, fmtTime } from './planner.js';
import { BossCard } from './Moments.jsx';
import { fmtDate, relDay } from './ui.jsx';
import { paperTotal } from './Tests.jsx';
import { SUBJECTS } from './seed.js';

const greet = (h) => (h < 5 ? 'Late night' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : h < 21 ? 'Evening' : 'Night');

// The dashboard: everything at a glance, with shortcuts into each part of the app.
export function HomeScreen({ state, go }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const today = S.today();
  const ds = state.settings.dayStart ?? 3;
  const nowMs = Date.now();
  const { now, next, list } = nowAndNext(state.plan, today, nowMs, ds);
  const doneBlocks = state.planDone[today] || [];
  const due = state.tasks.filter((t) => E.isDue(t, today));
  const dailiesDone = due.filter((t) => t.completed).length;
  const todos = state.tasks.filter((t) => t.type === 'todo' && !t.completed);
  const dueTodos = todos.filter((t) => t.due && t.due <= today);
  const focusMin = state.focus.sessions.filter((x) => x.day === today).reduce((a, x) => a + x.min, 0);
  const nextPaper = state.pts.flatMap((pt) => pt.papers.map((p) => ({ ...p, pt }))).filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const lastScored = state.pts.flatMap((pt) => pt.papers).filter((p) => paperTotal(p)?.pct != null).sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysLeft = state.settings.examDate ? E.daysBetween(today, state.settings.examDate) : null;
  const st = state.screenToday;
  const sc = state.settings.screen;
  const ring = due.length ? dailiesDone / due.length : 1;
  const C = 2 * Math.PI * 26;

  return (
    <div class="home">
      <div class="home-hello">
        <h1>{greet(new Date().getHours())}, {state.settings.name || 'John'}</h1>
        <span class="muted small">{fmtDate(today, true)}{daysLeft != null && daysLeft > 0 ? `, ${daysLeft} days to ${state.settings.examName || 'the exam'}` : ''}</span>
      </div>

      <section class={`now-card ${now ? 'live' : ''}`} onClick={() => go('study', 'plan')}>
        {now ? (
          <>
            <div class="now-k"><span class="live-dot" />Now, until {fmtTime(now.end && new Date(now.end).toTimeString().slice(0, 5))}</div>
            <div class="now-t">{now.title}</div>
            <div class="rail"><div class="fill xp" style={`width:${Math.min(100, ((nowMs - now.start) / (now.end - now.start)) * 100)}%`} /></div>
            {next && <div class="small muted" style="margin-top:8px">Next: {next.title} at {fmtTime(new Date(next.start).toTimeString().slice(0, 5))}</div>}
          </>
        ) : next ? (
          <>
            <div class="now-k">Next up at {fmtTime(new Date(next.start).toTimeString().slice(0, 5))}</div>
            <div class="now-t">{next.title}</div>
            <div class="small muted">{list.length} {list.length === 1 ? 'block' : 'blocks'} planned today, {doneBlocks.length} done</div>
          </>
        ) : (
          <>
            <div class="now-k">Planner</div>
            <div class="now-t muted">{list.length ? 'Done with today’s plan' : 'Nothing planned for today'}</div>
            <div class="small" style="color:var(--cy)">{list.length ? 'See tomorrow' : 'Plan your day'}</div>
          </>
        )}
      </section>

      <BossCard state={state} />

      <div class="dash-grid">
        <button class="dash" onClick={() => go('tasks', 'daily')}>
          <svg class="dash-ring" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="26" class="track" />
            <circle cx="32" cy="32" r="26" class="arc" stroke-dasharray={C} stroke-dashoffset={C * (1 - ring)} />
          </svg>
          <span class="dash-v">{dailiesDone}/{due.length}</span>
          <span class="dash-l">Dailies today</span>
        </button>
        <button class="dash" onClick={() => go('tasks', 'todo')}>
          <span class="dash-big">{todos.length}</span>
          <span class="dash-l">{dueTodos.length ? `${dueTodos.length} ${dueTodos.length === 1 ? 'to-do' : 'to-dos'} due now` : 'Open to-dos'}</span>
        </button>
        <button class="dash" onClick={() => go('study', 'focus')}>
          <span class="dash-big">{Math.floor(focusMin / 60)}<small>h</small> {focusMin % 60}<small>m</small></span>
          <span class="dash-l">Focused today</span>
        </button>
        <button class="dash" onClick={() => go('you')}>
          {sc?.enabled && st && !st.denied ? (
            <>
              <span class="dash-big">{Math.floor(st.total / 60)}<small>h</small> {st.total % 60}<small>m</small></span>
              <span class="dash-l">{(() => { const over = sc.limits.filter((l) => (st.used?.[l.id] || 0) > l.min).length; return over ? `${over} ${over === 1 ? 'limit' : 'limits'} broken` : 'Screen time, all limits kept'; })()}</span>
            </>
          ) : (
            <>
              <span class="dash-big">{state.user.gp.toFixed(1)}</span>
              <span class="dash-l">Gold to spend</span>
            </>
          )}
        </button>
      </div>

      {nextPaper && (
        <button class="card next-pt" onClick={() => go('tests')}>
          <div class="spread">
            <span><b>{nextPaper.name}</b> <span class="muted">{nextPaper.kind === 'mains' ? 'Mains' : 'Advanced'}</span></span>
            <span class="pill">{relDay(nextPaper.date, today)}</span>
          </div>
          <div class="chips" style="margin-top:10px">
            {SUBJECTS.flatMap((s) => nextPaper.pt.syllabus[s.key].slice(0, 2).map((c) => <span key={s.key + c} class="tagchip"><i class={`subj-dot dot-${s.key}`} />{c}</span>))}
          </div>
          {lastScored && <div class="small muted" style="margin-top:10px">Last paper: {lastScored.name}, {paperTotal(lastScored).pct.toFixed(1)}%</div>}
        </button>
      )}

      <div class="quick">
        <button class="qa" onClick={() => { go('tasks', 'todo'); S.requestQuickAdd(); }}><span>+</span>To-do</button>
        <button class="qa" onClick={() => go('study', 'focus')}><span>◷</span>Focus</button>
        <button class="qa" onClick={() => go('study', 'plan')}><span>▤</span>Plan</button>
        <button class="qa" onClick={() => go('store')}><span>◆</span>Store</button>
      </div>
    </div>
  );
}
