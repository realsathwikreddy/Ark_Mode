import { useRef, useState } from 'preact/hooks';
import * as S from './store.js';
import * as E from './engine.js';
import { Switch, fmtDate, fmtGold, DAY_LETTERS } from './ui.jsx';
import { askNotificationPermission, shareBackup, isNative, haptic } from './native.js';
import { ACHIEVEMENTS, ICONS } from './achievements.js';
import { BossArt } from './bosses.jsx';
import { sfx } from './sfx.js';
import { THEMES, switchTheme } from './themes.js';
import { ScreenTimeSection } from './ScreenTime.jsx';
import { LockSetup } from './Lock.jsx';
import { buildWorkbook } from './exportxlsx.js';
import { shareFile } from './native.js';
import { MODELS, testKey } from './claude.js';
import { WEB_VERSION, NATIVE_VERSION, checkForUpdate, applyNow, openLink } from './updates.js';

export function YouScreen({ state }) {
  const today = S.today();
  const st = state.settings;
  const daysLeft = st.examDate ? E.daysBetween(today, st.examDate) : null;
  return (
    <>
      <div class="section">
        <div class="card">
          <div class="spread" style="align-items:flex-end">
            <div>
              <div class="countdown-num">{daysLeft == null ? '—' : Math.max(0, daysLeft)}</div>
              <div class="small muted">days to {st.examName || 'the exam'}, {fmtDate(st.examDate)}</div>
            </div>
            <div style="text-align:right" class="small muted">{daysLeft > 0 ? `${Math.floor(daysLeft / 7)} weeks, ${daysLeft % 7} days` : ''}</div>
          </div>
        </div>
      </div>
      <Week state={state} />
      <ScreenTimeSection state={state} />
      <Stats state={state} />
      <Achievements state={state} />
      <Trophies state={state} />
      <Appearance state={state} />
      <Settings state={state} />
      <ClaudeSettings state={state} />
      <Backup state={state} />
      <About state={state} />
    </>
  );
}

function Week({ state }) {
  const today = S.today();
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(E.addDays(today, -i));
  const h = state.history;
  const dueToday = state.tasks.filter((t) => E.isDue(t, today));
  const rows = days.map((k) => {
    if (k === today) return { k, due: dueToday.length, done: dueToday.filter((t) => t.completed).length, ...h[k], live: true };
    return { k, ...h[k] };
  });
  const xp = rows.reduce((a, r) => a + (r.xp || 0), 0);
  const focus = rows.reduce((a, r) => a + (r.focusMin || 0), 0);
  const due = rows.reduce((a, r) => a + (r.due || 0), 0);
  const done = rows.reduce((a, r) => a + (r.done || 0), 0);
  const papers = state.pts.flatMap((pt) => pt.papers).filter((p) => p.date >= days[0] && p.date <= today && p.scores.m != null);
  return (
    <div class="section">
      <div class="section-head"><h2>Last 7 days</h2></div>
      <div class="card">
        <div class="week">
          {rows.map((r) => {
            const pct = r.due ? (r.done / r.due) * 100 : 0;
            return (
              <div key={r.k}>
                <div class={`week-cell ${r.rest ? 'rest' : ''}`} title={`${r.done || 0} of ${r.due || 0} dailies`}><div style={`height:${r.rest ? 100 : pct}%`} /></div>
                <div class="week-day" style={r.k === today ? 'color:var(--text);font-weight:700' : ''}>{DAY_LETTERS[E.parseKey(r.k).getDay()]}</div>
              </div>
            );
          })}
        </div>
        <div class="stat-grid" style="margin-top:12px">
          <div><div class="stat-v" style="font-size:20px">{due ? Math.round((done / due) * 100) : 0}%</div><div class="stat-l">Dailies done ({done}/{due})</div></div>
          <div><div class="stat-v" style="font-size:20px">{Math.floor(focus / 60)}h {focus % 60}m</div><div class="stat-l">Focused</div></div>
          <div><div class="stat-v" style="font-size:20px">{xp}</div><div class="stat-l">XP earned</div></div>
          <div><div class="stat-v" style="font-size:20px">{papers.length}</div><div class="stat-l">Papers logged</div></div>
        </div>
      </div>
    </div>
  );
}

function Stats({ state }) {
  const u = state.user;
  const dailies = state.tasks.filter((t) => t.type === 'daily');
  const best = dailies.reduce((b, t) => ((t.streak || 0) > (b?.streak || 0) ? t : b), null);
  return (
    <div class="section">
      <div class="section-head"><h2>Character</h2></div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-v">{u.lvl}</div><div class="stat-l">Level, {u.exp}/{E.toNextLevel(u.lvl)} XP</div></div>
        <div class="stat"><div class="stat-v">{fmtGold(u.gp)}</div><div class="stat-l">Gold</div></div>
        <div class="stat"><div class="stat-v">{best?.streak || 0}</div><div class="stat-l">{best?.streak ? `Best streak: ${best.text}` : 'Best daily streak'}</div></div>
        <div class="stat"><div class="stat-v">{u.deaths || 0}</div><div class="stat-l">Times health ran out</div></div>
      </div>
    </div>
  );
}

function Achievements({ state }) {
  const [open, setOpen] = useState(null);
  const have = state.achievements || {};
  const count = ACHIEVEMENTS.filter((a) => have[a.id]).length;
  const a = open && ACHIEVEMENTS.find((x) => x.id === open);
  return (
    <div class="section">
      <div class="section-head"><h2>Achievements</h2><span class="small muted">{count} of {ACHIEVEMENTS.length}</span></div>
      <div class="card">
        <div class="badges">
          {ACHIEVEMENTS.map((x) => (
            <button key={x.id} class={`badge ${have[x.id] ? 'on' : ''}`} onClick={() => setOpen(open === x.id ? null : x.id)} aria-label={`${x.name}${have[x.id] ? ', unlocked' : ', locked'}`}>
              <span class="badge-hex">
                <svg class="hex" viewBox="0 0 54 60" aria-hidden="true"><polygon points="27,2 51,15.5 51,44.5 27,58 3,44.5 3,15.5" /></svg>
                <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONS[x.icon]} /></svg>
              </span>
              {x.name}
            </button>
          ))}
        </div>
        {a && (
          <p class="small" style="margin:14px 0 0">
            <b>{a.name}:</b> {a.desc} <span class="muted">{have[a.id] ? `Unlocked ${fmtDate(have[a.id])}.` : 'Locked.'}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function Trophies({ state }) {
  const list = (state.bossHistory || []).slice().reverse();
  if (!list.length) return null;
  return (
    <div class="section">
      <div class="section-head"><h2>Bosses</h2><span class="small muted">{list.filter((b) => b.result === 'defeated').length} defeated</span></div>
      <div class="card">
        {list.map((b) => (
          <div key={b.n} class="bl">
            <span style="width:40px;height:40px;flex:none;display:grid;place-items:center"><BossArt n={b.n} class={b.result === 'defeated' ? '' : 'dim'} /></span>
            <span class="grow"><div>{b.name}</div><div class="small muted">PT-{b.n}, {b.result === 'defeated' ? `defeated ${fmtDate(b.day)}` : 'escaped'}</div></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Appearance({ state }) {
  const cur = state.settings.theme || 'neon';
  const pick = (id) => (e) => {
    if (id === cur) return;
    const r = e.currentTarget.getBoundingClientRect();
    sfx.whoosh(); haptic('light');
    switchTheme(id, r.left + r.width / 2, r.top + r.height / 2, () => S.setSetting('theme', id));
  };
  return (
    <div class="section">
      <div class="section-head"><h2>Theme</h2><span class="small muted">All free</span></div>
      <div class="themes">
        {THEMES.map((t) => (
          <button key={t.id} class={`theme-card ${cur === t.id ? 'on' : ''}`} onClick={pick(t.id)} aria-label={`${t.name} theme${cur === t.id ? ', in use' : ''}`} aria-pressed={cur === t.id}>
            <span class="theme-sw" style={`background:${t.bg}`}>
              <i style={`background:${t.a};box-shadow:0 0 ${t.dark ? 10 : 0}px ${t.a}`} />
              <i style={`background:${t.b};box-shadow:0 0 ${t.dark ? 10 : 0}px ${t.b}`} />
              <b style={`border-color:${t.a}`} />
              {t.rain && <><em class="sw-drop" style="left:30%;top:34%" /><em class="sw-drop" style="left:62%;top:52%;width:9px;height:11px" /></>}
            </span>
            <span class="theme-n">{t.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Settings({ state }) {
  const [lockOpen, setLockOpen] = useState(false);
  const st = state.settings;
  const set = S.setSetting;
  return (
    <div class="section">
      <div class="section-head"><h2>Settings</h2></div>
      <div class="card">
        <div class="setting">
          <div class="grow"><div>Rest mode</div><div class="small muted">Pauses dailies. No damage, streaks kept. For holidays or exam days.</div></div>
          <Switch checked={st.restMode} onChange={(v) => set('restMode', v)} label="Rest mode" />
        </div>
        {state.settings.theme === 'monsoon' && (
          <div class="setting">
            <div class="grow"><div>Droplet lens</div><div class="small muted">Raindrops on the glass that bend what's under them. Turn off if scrolling feels slow.</div></div>
            <Switch checked={state.settings.lens !== false} onChange={(v) => set('lens', v)} label="Droplet lens" />
          </div>
        )}
        <div class="setting">
          <div class="grow">Your name</div>
          <input class="input" style="width:150px" value={st.name} onInput={(e) => set('name', e.target.value)} aria-label="Your name" />
        </div>
        <div class="setting">
          <div class="grow"><div>App lock</div><div class="small muted">{state.settings.lock.enabled ? `On${state.settings.lock.bio ? ', with fingerprint' : ''}` : 'Off'}</div></div>
          <button class="btn ghost small" onClick={() => setLockOpen(true)}>{state.settings.lock.enabled ? 'Manage' : 'Set PIN'}</button>
        </div>
        <div class="setting">
          <div class="grow"><div>Sound effects</div><div class="small muted">Ticks, coins, boss hits, timer chime.</div></div>
          <Switch checked={st.sound} onChange={(v) => { set('sound', v); if (v) sfx.tick(); }} label="Sound effects" />
        </div>
        <div class="setting">
          <div class="grow"><div>Vibration</div><div class="small muted">Small buzzes on ticks, hits and level-ups.</div></div>
          <Switch checked={st.haptics} onChange={(v) => { set('haptics', v); if (v) haptic('medium'); }} label="Vibration" />
        </div>
        <div class="setting">
          <div class="grow"><div>Daily reminder</div><div class="small muted">{isNative ? 'Only fires if dailies are still open.' : 'Works in the phone app.'}</div></div>
          <Switch checked={st.reminders} onChange={async (v) => { if (v) await askNotificationPermission(); set('reminders', v); }} label="Daily reminder" />
        </div>
        {st.reminders && (
          <div class="setting">
            <div class="grow">Remind me at</div>
            <input class="input" style="width:120px" type="time" value={st.reminderTime} onChange={(e) => set('reminderTime', e.target.value)} />
          </div>
        )}
        <div class="setting">
          <div class="grow"><div>New day starts at</div><div class="small muted">Work done before this still counts for the previous day.</div></div>
          <select class="input" style="width:100px" value={st.dayStart} onChange={(e) => set('dayStart', Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => <option key={h} value={h}>{h === 0 ? '12 AM' : `${h} AM`}</option>)}
          </select>
        </div>
        <div class="setting">
          <div class="grow">Exam</div>
          <input class="input" style="width:150px" value={st.examName} onInput={(e) => set('examName', e.target.value)} />
        </div>
        <div class="setting">
          <div class="grow">Exam date</div>
          <input class="input" style="width:160px" type="date" value={st.examDate} onChange={(e) => set('examDate', e.target.value)} />
        </div>
        <div class="setting">
          <div class="grow">Break length</div>
          <select class="input" style="width:100px" value={st.breakMinutes} onChange={(e) => set('breakMinutes', Number(e.target.value))}>
            {[5, 10, 15, 20].map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
      </div>
      {lockOpen && <LockSetup state={state} onClose={() => setLockOpen(false)} />}
    </div>
  );
}

function ClaudeSettings({ state }) {
  const c = state.settings.claude;
  const [key, setKey] = useState(c.key);
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    S.setClaude({ key: key.trim() });
    if (!key.trim()) { setMsg('Key removed.'); return; }
    setMsg('Checking…');
    try { await testKey({ ...state.settings, claude: { ...c, key: key.trim() } }); setMsg('Key works.'); }
    catch (e) { setMsg(e.message); }
  };
  return (
    <div class="section">
      <div class="section-head"><h2>Claude</h2><span class="small muted">{c.key ? 'Connected' : 'Not set'}</span></div>
      <div class="card">
        <p class="small muted" style="margin:0 0 12px">Your own Claude API key powers "Plan with Claude" and the Radar smart filter. It stays on this phone and is only sent to Anthropic. API use is billed to your Anthropic account.</p>
        <label class="field">API key
          <div class="row">
            <input class="input grow" type={show ? 'text' : 'password'} value={key} onInput={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
            <button class="btn ghost small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        <div class="field"><span>Model</span>
          <div class="chips">{MODELS.map((m) => <button key={m.id} class={`chip ${c.model === m.id ? 'on' : ''}`} onClick={() => S.setClaude({ model: m.id })}>{m.name}</button>)}</div>
        </div>
        <div class="row"><button class="btn small" onClick={save}>Save key</button>{msg && <span class="small">{msg}</span>}</div>
      </div>
    </div>
  );
}

function About({ state }) {
  const [msg, setMsg] = useState('');
  const check = async () => {
    setMsg('Checking…');
    try {
      const u = await checkForUpdate();
      if (u.kind === 'web-ready') { S.setUpdate(u); setMsg(`Version ${u.web} downloaded.`); }
      else if (u.kind === 'apk') { S.setUpdate(u); setMsg('A new version needs one install.'); }
      else setMsg('You\u2019re on the latest version.');
    } catch (e) { setMsg(navigator.onLine === false ? 'You\u2019re offline.' : `Couldn\u2019t update right now (${String(e.message).replace(/https?:\/\/\S+/g, '').trim() || 'download failed'}). Try again on wifi.`); }
  };
  return (
    <div class="section">
      <div class="section-head"><h2>App</h2><span class="small muted">Version {WEB_VERSION} (native {NATIVE_VERSION})</span></div>
      <div class="card">
        <p class="small muted" style="margin:0 0 12px">Updates download by themselves when you're online and apply the next time you open Ark Mode. Bigger ones ask for a single tap to install.</p>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn ghost small" onClick={check}>Check for updates</button>
          {state.update?.kind === 'web-ready' && <button class="btn small" onClick={() => applyNow(state.update.id)}>Restart to update</button>}
          {state.update?.kind === 'apk' && <button class="btn small" onClick={() => openLink(state.update.url)}>Download update</button>}
        </div>
        {msg && <p class="small" style="margin:10px 0 0">{msg}</p>}
      </div>
    </div>
  );
}

function Backup({ state }) {
  const file = useRef(null);
  const [msg, setMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const exp = async () => {
    try { setMsg(await shareBackup(S.exportData())); } catch (e) { setMsg(`Backup failed: ${e.message}`); }
  };
  const imp = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { S.importData(r.result); setMsg('Backup restored.'); } catch (err) { setMsg(err.message); }
    };
    r.readAsText(f);
    e.target.value = '';
  };
  return (
    <div class="section">
      <div class="section-head"><h2>Backup</h2></div>
      <div class="card">
        <p class="small muted" style="margin:0 0 12px">Everything lives only on this phone. Save a backup to Drive or WhatsApp now and then, so a reset or a new phone doesn't wipe it.</p>
        <div class="row" style="flex-wrap:wrap">
          <button class="btn small" onClick={exp}>Save backup</button>
          <button class="btn ghost small" onClick={() => file.current.click()}>Restore from file</button>
          <button class="btn ghost small" onClick={async () => { try { setMsg(await shareFile(`arkmode-scores-${new Date().toISOString().slice(0, 10)}.xlsx`, buildWorkbook(state), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')); } catch (e) { setMsg(`Export failed: ${e.message}`); } }}>Export scores to Excel</button>
          <input ref={file} type="file" accept="application/json,.json" style="display:none" onChange={imp} />
        </div>
        {msg && <p class="small" style="margin:10px 0 0">{msg}</p>}
        <div style="margin-top:16px">
          {!confirmReset ? (
            <button class="link" style="color:var(--bad)" onClick={() => setConfirmReset(true)}>Start over</button>
          ) : (
            <div class="row" style="flex-wrap:wrap"><span class="small">This erases every task, score and stat.</span><button class="btn danger small" onClick={() => { S.resetAll(); setConfirmReset(false); }}>Erase everything</button><button class="btn ghost small" onClick={() => setConfirmReset(false)}>Keep it</button></div>
          )}
        </div>
      </div>
    </div>
  );
}
