import { useEffect, useState } from 'preact/hooks';
import * as S from './store.js';
import { Sheet, Switch } from './ui.jsx';
import { openLink } from './updates.js';
import { relDay } from './ui.jsx';

export const CATS = [
  { key: 'hackathon', name: 'Hackathons' },
  { key: 'ai', name: 'AI classes' },
  { key: 'music', name: 'Music' },
  { key: 'internship', name: 'Internships' },
  { key: 'jee', name: 'JEE & college news' },
];
export const PLACES = [
  { key: 'online', name: 'Online' },
  { key: 'hyderabad', name: 'Hyderabad' },
  { key: 'india', name: 'Rest of India' },
  { key: 'international', name: 'Abroad (travel paid)' },
];
const catName = (k) => CATS.find((c) => c.key === k)?.name || k;
const placeName = (k) => PLACES.find((p) => p.key === k)?.name.replace(' (travel paid)', '') || k;

// Opportunities feed: hackathons, AI classes, music, internships and JEE news, filtered to what Sathwik wants.
export function RadarScreen({ state }) {
  const r = state.radar;
  const [tab, setTab] = useState('new');
  const [cat, setCat] = useState('all');
  const [prefs, setPrefs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { refresh(false); S.markRadarRead(); }, []);
  const refresh = async (manual) => {
    setLoading(true); setMsg('');
    try { const n = await S.refreshRadar({ manual }); if (manual) setMsg(n ? `${n} new` : 'Nothing new right now.'); }
    catch (e) { setMsg(navigator.onLine === false ? 'You’re offline. Showing the last saved list.' : `Couldn’t reach the feed: ${e.message}`); }
    setLoading(false);
  };

  const all = S.radarItems(state);
  const list = all.filter((i) => (tab === 'saved' ? r.saved.includes(i.id) : !r.dismissed.includes(i.id)) && (cat === 'all' || i.cat === cat));

  return (
    <>
      <div class="section-head">
        <h1>Radar</h1>
        <button class="link" onClick={() => setPrefs(true)}>Interests</button>
      </div>
      <p class="small muted" style="margin:-6px 0 12px">
        {r.updated ? `Feed updated ${timeAgo(r.updated)}.` : 'Checks for new things every few hours, even when the app is closed.'}
        {state.settings.claude?.key && r.smart ? ' Claude is filtering it for you.' : ''}
      </p>
      <div class="seg">
        <button class={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>For you<span class="count">{all.filter((i) => !r.dismissed.includes(i.id)).length}</span></button>
        <button class={tab === 'saved' ? 'on' : ''} onClick={() => setTab('saved')}>Saved<span class="count">{r.saved.length}</span></button>
      </div>
      <div class="chips tag-filter">
        <button class={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>All</button>
        {CATS.filter((c) => state.settings.radar.cats.includes(c.key)).map((c) => <button key={c.key} class={`chip ${cat === c.key ? 'on' : ''}`} onClick={() => setCat(c.key)}>{c.name}</button>)}
      </div>
      {msg && <p class="small" style="margin:0 0 10px">{msg}</p>}
      {list.length === 0 ? (
        <div class="empty"><p>{loading ? 'Checking the feed…' : tab === 'saved' ? 'Nothing saved yet. Tap Save on anything you want to come back to.' : r.items.length ? 'You’ve cleared everything. New things show up here as they’re found.' : 'No feed yet. It needs internet the first time.'}</p>
          {tab === 'new' && <button class="btn small" disabled={loading} onClick={() => refresh(true)}>Check now</button>}</div>
      ) : (
        <div class="radar-list">
          {list.map((i) => <Item key={i.id} i={i} saved={r.saved.includes(i.id)} fresh={!r.read.includes(i.id)} />)}
          <div style="text-align:center;margin-top:8px"><button class="link" disabled={loading} onClick={() => refresh(true)}>{loading ? 'Checking…' : 'Check now'}</button></div>
        </div>
      )}
      {prefs && <Interests state={state} onClose={() => setPrefs(false)} />}
    </>
  );
}

function Item({ i, saved, fresh }) {
  return (
    <article class={`opp ${fresh ? 'fresh' : ''}`}>
      <div class="opp-top">
        <span class={`opp-cat cat-${i.cat}`}>{catName(i.cat)}</span>
        <span class="small muted">{[placeName(i.place), i.funded ? 'travel paid' : ''].filter(Boolean).join(', ')}</span>
      </div>
      <button class="opp-title" onClick={() => openLink(i.url)}>{i.title}</button>
      {i.summary && <p class="opp-sum">{i.summary}</p>}
      <div class="task-meta">
        <span>{i.source}{i.org ? `, ${i.org}` : ''}</span>
        {i.when && <span>{i.when}</span>}
        {i.detail && !i.summary && <span>{i.detail}</span>}
      </div>
      <div class="opp-actions">
        <button class="btn small" onClick={() => openLink(i.url)}>Open</button>
        <button class="btn ghost small" onClick={() => S.toggleSaved(i.id)}>{saved ? 'Saved' : 'Save'}</button>
        {!saved && <button class="link" onClick={() => S.dismissOpp(i.id)}>Not for me</button>}
      </div>
    </article>
  );
}

function timeAgo(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return relDay(new Date(iso).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
}

function Interests({ state, onClose }) {
  const rs = state.settings.radar;
  const toggle = (k, key) => S.setRadar({ [k]: rs[k].includes(key) ? rs[k].filter((x) => x !== key) : [...rs[k], key] });
  return (
    <Sheet title="Interests" onClose={onClose} actions={<button class="btn" onClick={onClose}>Done</button>}>
      <div class="field"><span>Show me</span>
        <div class="chips">{CATS.map((c) => <button key={c.key} class={`chip ${rs.cats.includes(c.key) ? 'on' : ''}`} onClick={() => toggle('cats', c.key)}>{c.name}</button>)}</div>
      </div>
      <div class="field"><span>Where</span>
        <div class="chips">{PLACES.map((p) => <button key={p.key} class={`chip ${rs.places.includes(p.key) ? 'on' : ''}`} onClick={() => toggle('places', p.key)}>{p.name}</button>)}</div>
        <span class="small muted">Abroad only shows things that mention paying for travel.</span>
      </div>
      <div class="setting">
        <div class="grow"><div>Notifications</div><div class="small muted">Up to 3 at a time when new things match.</div></div>
        <Switch checked={rs.notify} onChange={(v) => S.setRadar({ notify: v })} label="Radar notifications" />
      </div>
      <div class="setting">
        <div class="grow"><div>Smart filter with Claude</div><div class="small muted">{state.settings.claude?.key ? 'Claude reads new listings, hides weak matches and writes a one-line summary. Uses your API key.' : 'Add your Claude API key in You → Settings to use this.'}</div></div>
        <Switch checked={!!state.radar.smart} onChange={(v) => S.setRadarSmart(v)} label="Smart filter" />
      </div>
    </Sheet>
  );
}
