import { useEffect, useState } from 'preact/hooks';
import * as S from './store.js';
import * as E from './engine.js';
import { Sheet, Switch, Icon, DAY_LETTERS } from './ui.jsx';
import { openUsageSettings, screenPermission, listApps, CATEGORIES, isNative } from './native.js';

const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

// Screen time: today's usage against your limits, the last 7 days, and the limit editor.
export function ScreenTimeSection({ state }) {
  const sc = state.settings.screen;
  const st = state.screenToday;
  const [perm, setPerm] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => { screenPermission().then(setPerm); if (sc.enabled) S.refreshScreenToday(); }, [sc.enabled]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') { screenPermission().then(setPerm); S.refreshScreenToday(); } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const today = S.today();
  const days = Array.from({ length: 7 }, (_, i) => E.addDays(today, i - 6));
  const series = days.map((d) => (d === today ? st?.total || 0 : state.history[d]?.screen?.total || 0));
  const maxV = Math.max(60, ...series);

  return (
    <div class="section">
      <div class="section-head"><h2>Screen time</h2>{sc.enabled && <button class="link" onClick={() => setEditing(true)}>Limits</button>}</div>
      <div class="card">
        {!sc.enabled ? (
          <>
            <p class="small" style="margin:0 0 12px">Set daily limits for apps like Instagram or YouTube. Staying under pays gold. Going over costs health and heals the boss. Stay under every limit and you land a 30-damage bonus hit at the reset.</p>
            <button class="btn small" onClick={() => { S.setScreen({ enabled: true }); setEditing(true); }}>Turn on screen time</button>
          </>
        ) : perm === false ? (
          <>
            <p class="small" style="margin:0 0 12px">Ark Mode needs <b>Usage access</b> to see how long you use each app. Nothing leaves your phone. Tap below, find Ark Mode in the list and switch it on, then come back.</p>
            <button class="btn small" onClick={() => openUsageSettings().then(() => setTimeout(() => screenPermission().then(setPerm), 500))}>Open usage access</button>
            {!isNative && <p class="small muted" style="margin:10px 0 0">(In this browser preview, that button switches on sample data.)</p>}
          </>
        ) : (
          <>
            <div class="spread" style="align-items:flex-end">
              <div><div class="stat-v">{hm(st?.total || 0)}</div><div class="stat-l">Today, {st?.pickups || 0} unlocks</div></div>
              <svg class="mini-bars" viewBox="0 0 140 48" aria-label="Screen time, last 7 days">
                {series.map((v, i) => {
                  const h = Math.max(2, (v / maxV) * 40);
                  return <g key={i}><rect x={i * 20 + 3} y={42 - h} width="12" height={h} rx="3" class={i === 6 ? 'today' : ''} /><text x={i * 20 + 9} y="48" text-anchor="middle">{DAY_LETTERS[E.parseKey(days[i]).getDay()]}</text></g>;
                })}
              </svg>
            </div>
            {sc.limits.length === 0 ? (
              <p class="small muted" style="margin:12px 0 0">No limits yet. Add one to start earning gold for staying under it.</p>
            ) : (
              <div class="limits">
                {sc.limits.map((l) => {
                  const used = st?.used?.[l.id] || 0;
                  const over = used > l.min;
                  return (
                    <div key={l.id} class={`limit ${over ? 'over' : ''}`}>
                      <div class="spread small"><span>{l.label}</span><span class={over ? '' : 'muted'}>{used} / {l.min} min</span></div>
                      <div class="rail"><div class={`fill ${over ? 'hp' : 'good'}`} style={`width:${Math.min(100, (used / l.min) * 100)}%`} /></div>
                    </div>
                  );
                })}
              </div>
            )}
            {st?.apps?.length > 0 && (
              <details class="apps-today">
                <summary class="small">Top apps today</summary>
                {st.apps.slice(0, 8).map((a) => <div key={a.pkg} class="spread small" style="padding:4px 0"><span>{a.label}</span><span class="muted">{hm(a.min)}</span></div>)}
              </details>
            )}
          </>
        )}
      </div>
      {editing && <LimitsSheet state={state} onClose={() => { setEditing(false); S.refreshScreenToday(); }} />}
    </div>
  );
}

function LimitsSheet({ state, onClose }) {
  const sc = state.settings.screen;
  const [apps, setApps] = useState([]);
  const [kind, setKind] = useState('app');
  const [key, setKey] = useState('');
  const [min, setMin] = useState(30);
  const [q, setQ] = useState('');
  useEffect(() => { listApps().then((a) => setApps(a.sort((x, y) => x.label.localeCompare(y.label)))); }, []);

  const add = () => {
    const label = kind === 'app' ? apps.find((a) => a.pkg === key)?.label : `All ${CATEGORIES.find((c) => String(c.key) === String(key))?.name.toLowerCase()} apps`;
    if (!key || !label) return;
    S.setScreen({ limits: [...sc.limits, { id: S.uid(), kind, key, label, min: Math.max(5, Number(min) || 30) }] });
    setKey('');
  };
  const shown = apps.filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  return (
    <Sheet title="Screen time limits" onClose={onClose} actions={<button class="btn" onClick={onClose}>Done</button>}>
      {sc.limits.map((l) => (
        <div key={l.id} class="bl">
          <span class="grow">{l.label}</span>
          <input class="input" style="width:76px;text-align:center" type="number" min="5" value={l.min} onChange={(e) => S.setScreen({ limits: sc.limits.map((x) => (x.id === l.id ? { ...x, min: Math.max(5, Number(e.target.value) || 5) } : x)) })} aria-label={`${l.label} minutes`} />
          <span class="small muted">min</span>
          <button class="link" aria-label={`Remove ${l.label}`} onClick={() => S.setScreen({ limits: sc.limits.filter((x) => x.id !== l.id) })}><Icon name="trash" size={18} /></button>
        </div>
      ))}
      <div class="card" style="margin:12px 0">
        <div class="chips" style="margin-bottom:12px">
          <button class={`chip ${kind === 'app' ? 'on' : ''}`} onClick={() => { setKind('app'); setKey(''); }}>One app</button>
          <button class={`chip ${kind === 'cat' ? 'on' : ''}`} onClick={() => { setKind('cat'); setKey(''); }}>A whole category</button>
        </div>
        {kind === 'app' ? (
          <>
            <input class="input" placeholder="Search apps" value={q} onInput={(e) => setQ(e.target.value)} style="margin-bottom:8px" />
            <div class="app-pick">
              {shown.map((a) => <button key={a.pkg} class={`chip ${key === a.pkg ? 'on' : ''}`} onClick={() => setKey(a.pkg)}>{a.label}</button>)}
            </div>
          </>
        ) : (
          <div class="chips">{CATEGORIES.map((c) => <button key={c.key} class={`chip ${String(key) === String(c.key) ? 'on' : ''}`} onClick={() => setKey(String(c.key))}>{c.name}</button>)}</div>
        )}
        <div class="row" style="margin-top:12px">
          <label class="field grow" style="margin:0">Minutes a day<input class="input" type="number" min="5" value={min} onInput={(e) => setMin(e.target.value)} /></label>
          <button class="btn small" style="align-self:flex-end" disabled={!key} onClick={add}>Add limit</button>
        </div>
      </div>
      <div class="setting">
        <div class="grow"><div>Screen time on</div><div class="small muted">Turn off to stop limits counting.</div></div>
        <Switch checked={sc.enabled} onChange={(v) => S.setScreen({ enabled: v })} label="Screen time on" />
      </div>
    </Sheet>
  );
}
