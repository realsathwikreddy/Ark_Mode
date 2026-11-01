import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import './styles.css';
import './themes.css';
import './motion.css';
import * as S from './store.js';
import * as E from './engine.js';
import { Icon } from './ui.jsx';
import { TasksScreen, Checkin } from './Tasks.jsx';
import { ShopScreen } from './Shop.jsx';
import { TestsScreen } from './Tests.jsx';
import { StudyScreen } from './Study.jsx';
import { YouScreen } from './You.jsx';
import { HomeScreen } from './Home.jsx';
import { LockScreen } from './Lock.jsx';
import { Moments } from './Moments.jsx';
import { Frame } from './frames.jsx';
import { applyTheme } from './themes.js';
import { countTo } from './dust.js';
import { burst, centerOf } from './fx.js';
import { blocksFor, blockRange, nowAndNext, fmtTime } from './planner.js';
import { scheduleReminders, askNotificationPermission, isNative, updateWidget, schedulePlan } from './native.js';
import { sfx } from './sfx.js';
import { RadarScreen } from './Radar.jsx';
import { appReady, checkForUpdate, applyNow, openLink } from './updates.js';
import { Rain } from './rain.jsx';

const SCREENS = [
  { key: 'home', name: 'Home', icon: 'home' },
  { key: 'tasks', name: 'Tasks', icon: 'tasks' },
  { key: 'study', name: 'Study', icon: 'study' },
  { key: 'tests', name: 'Tests', icon: 'tests' },
  { key: 'store', name: 'Store', icon: 'shop' },
  { key: 'you', name: 'You', icon: 'you' },
];

// Numbers in the header tick up and down instead of jumping.
function Counter({ value, fmt, class: cls, id }) {
  const ref = useRef(null);
  const prev = useRef(value);
  useEffect(() => { countTo(ref.current, prev.current, value, { fmt }); prev.current = value; }, [value]);
  return <span ref={ref} class={cls} id={id}>{fmt(value)}</span>;
}

function Hero({ state }) {
  const u = state.user;
  const need = E.toNextLevel(u.lvl);
  const today = S.today();
  const open = state.tasks.filter((t) => E.isDue(t, today) && !t.completed).length;
  const [flash, setFlash] = useState('');
  const prevHp = useRef(u.hp);
  const prevExp = useRef(u.exp + u.lvl * 10000);
  useEffect(() => {
    if (u.hp < prevHp.current - 0.05) { setFlash('hurt'); sfx.bad(); setTimeout(() => setFlash(''), 600); }
    else if (u.hp > prevHp.current + 0.05 && state.fx?.kind === 'heal') { setFlash('healed'); setTimeout(() => setFlash(''), 900); }
    prevHp.current = u.hp;
  }, [u.hp]);
  const expKey = u.exp + u.lvl * 10000;
  const [shimmer, setShimmer] = useState(0);
  useEffect(() => { if (expKey > prevExp.current) setShimmer(Date.now()); prevExp.current = expKey; }, [expKey]);

  return (
    <header class={`hero ${flash}`}>
      <div class="hero-row">
        <div class="level">
          <span class="level-wrap"><Frame id={state.store.frame} /><span class="level-num">{u.lvl}</span></span>
          <span class="level-label">{E.titleFor(u.lvl)}</span>
        </div>
        <div class="bars">
          <div>
            <div class="bar-top"><b>Health</b><span><Counter value={Math.max(0, u.hp)} fmt={(v) => String(Math.round(v * 10) / 10)} /> / {E.MAX_HP}</span></div>
            <div class="rail"><div class="fill hp" style={`width:${(Math.max(0, u.hp) / E.MAX_HP) * 100}%`} /></div>
          </div>
          <div>
            <div class="bar-top"><b>Experience</b><span><Counter value={u.exp} fmt={(v) => String(Math.round(v))} /> / {need}</span></div>
            <div class="rail"><div class={`fill xp ${shimmer ? 'shimmer' : ''}`} key={shimmer} style={`width:${(u.exp / need) * 100}%`} /></div>
          </div>
        </div>
      </div>
      <div class="hero-foot">
        <span class="gold" id="gold-anchor"><span class="coin" /><Counter value={Math.floor(u.gp * 10) / 10} fmt={(v) => v.toFixed(1)} /></span>
        {state.settings.restMode ? <span class="rest-pill">Resting, dailies paused</span> : <span>{open ? `${open} ${open === 1 ? 'daily' : 'dailies'} left today` : 'All dailies done'}</span>}
      </div>
    </header>
  );
}

function UndoBar({ undo }) {
  if (!undo) return null;
  return (
    <div class="undo-bar" key={undo.id} role="status">
      <span>{undo.label}</span>
      <button onClick={S.undo}>Undo</button>
      <i class="undo-timer" />
    </div>
  );
}

function UpdateBar({ u }) {
  return (
    <div class="update-bar">
      <span class="spark">✦</span>
      <span class="grow">{u.kind === 'apk' ? 'New version: tap to download and install' : `Update ${u.web} ready`}</span>
      {u.kind === 'apk'
        ? <button class="btn small" onClick={() => openLink(u.url)}>Install</button>
        : <button class="btn small" onClick={() => applyNow(u.id)}>Restart</button>}
      <button class="link" aria-label="Later" onClick={() => S.setUpdate(null)}>Later</button>
    </div>
  );
}

function App() {
  const state = S.useStore();
  const [screen, setScreenRaw] = useState('home');
  const [dir, setDir] = useState(1);
  const [taskTab, setTaskTab] = useState('daily');
  const [studyTab, setStudyTab] = useState('plan');
  const awayAt = useRef(0);
  const idx = SCREENS.findIndex((s) => s.key === screen);

  const setScreen = (key) => {
    const ni = SCREENS.findIndex((s) => s.key === key);
    if (ni === idx) return;
    setDir(ni > idx ? 1 : -1);
    sfx.whoosh();
    setScreenRaw(key);
  };
  const go = (key, sub) => {
    if (key === 'tasks' && sub) setTaskTab(sub);
    if (key === 'study' && sub) setStudyTab(sub);
    setScreen(key);
  };

  useEffect(() => { applyTheme(state.settings.theme); }, [state.settings.theme]);

  useEffect(() => {
    S.checkDay();
    const t = setInterval(S.checkDay, 60000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (awayAt.current && Date.now() - awayAt.current > 30000) S.lockNow();
        S.checkDay();
      } else awayAt.current = Date.now();
    };
    document.addEventListener('visibilitychange', onVis);
    const subs = [];
    const openUrl = (url) => {
      if (!url) return;
      if (url.includes('add')) { go('tasks', 'todo'); S.requestQuickAdd(); }
      else if (url.includes('radar')) go('radar');
      else if (url.includes('update')) go('you');
    };
    // Updates and the opportunities feed, whenever we're online.
    const online = async () => {
      try {
        const u = await checkForUpdate();
        if (u.kind === 'web-ready' || u.kind === 'apk') S.setUpdate(u);
      } catch {}
      try { await S.refreshRadar(); } catch {}
    };
    appReady();
    setTimeout(online, 2500);
    S.startFeedWorker().then((n) => { if (n > 0) S.toast(`${n} new on Radar`, 'info'); });
    window.addEventListener('online', online);
    if (isNative) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          if (awayAt.current && Date.now() - awayAt.current > 30000) S.lockNow();
          S.checkDay();
          if (Date.now() - awayAt.current > 10 * 60000) online();
          S.startFeedWorker().then((n) => { if (n > 0) S.toast(`${n} new on Radar`, 'info'); });
        }
        else {
          awayAt.current = Date.now(); S.flush();
          // A downloaded update applies quietly when you leave the app.
        }
      }).then((h) => subs.push(h));
      CapApp.addListener('appUrlOpen', ({ url }) => openUrl(url)).then((h) => subs.push(h));
      CapApp.getLaunchUrl().then((r) => openUrl(r?.url)).catch(() => {});
      CapApp.addListener('backButton', () => {
        const st = S.getState();
        if (st.locked) { CapApp.minimizeApp(); return; }
        if (st.queue?.length) { S.dismissOverlay(st.queue[0].id); return; }
        if (window.__sheetClose) { window.__sheetClose(); return; }
        setScreenRaw((s) => { if (s !== 'home') { setDir(-1); return 'home'; } CapApp.minimizeApp(); return s; });
      }).then((h) => subs.push(h));
      if (state.settings.reminders) askNotificationPermission();
    }
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', online); subs.forEach((h) => h.remove()); };
  }, []);

  // Widget: keep it in step, including what's planned right now.
  useEffect(() => {
    const t = setTimeout(() => {
      const ds = state.settings.dayStart ?? 3;
      const { now, next } = nowAndNext(state.plan, S.today(), Date.now(), ds);
      const hhmm = (ms) => fmtTime(new Date(ms).toTimeString().slice(0, 5));
      const line = now ? `Now: ${now.title} until ${hhmm(now.end)}` : next ? `Next: ${next.title} at ${hhmm(next.start)}` : '';
      updateWidget(state, line);
    }, 600);
    return () => clearTimeout(t);
  }, [state.user, state.tasks, state.boss, state.settings.restMode, state.lastCron, state.plan, state.planDone]);

  useEffect(() => { const t = setTimeout(() => scheduleReminders(state), 800); return () => clearTimeout(t); },
    [state.tasks, state.settings.reminders, state.settings.reminderTime, state.settings.restMode, state.lastCron]);
  useEffect(() => { const t = setTimeout(() => schedulePlan(state, blocksFor, blockRange), 900); return () => clearTimeout(t); },
    [state.plan, state.lastCron]);

  // Potion: particles rise out of the health bar.
  useEffect(() => {
    if (state.fx?.kind !== 'heal') return;
    const bar = document.querySelector('.hero .fill.hp');
    if (bar) { const r = bar.getBoundingClientRect(); for (let i = 0; i < 4; i++) setTimeout(() => burst(r.left + Math.random() * r.width, r.top, 'var(--good)', 8, 40), i * 90); }
  }, [state.fx?.at]);

  if (state.locked) return <LockScreen state={state} />;
  const monsoon = state.settings.theme === 'monsoon';

  return (
    <>
      {monsoon && <Rain lens={state.settings.lens !== false} screen={screen} />}
      <div class={`stage ${monsoon && state.settings.lens !== false ? 'lensed' : ''}`}>
      <Hero state={state} />
      {state.update && <UpdateBar u={state.update} />}
      <main class={`main enter ${dir > 0 ? 'from-right' : 'from-left'}`} key={screen}>
        {screen === 'home' && <HomeScreen state={state} go={go} />}
        {screen === 'tasks' && <TasksScreen state={state} tab={taskTab} setTab={setTaskTab} />}
        {screen === 'study' && <StudyScreen state={state} sub={studyTab} setSub={setStudyTab} />}
        {screen === 'tests' && <TestsScreen state={state} />}
        {screen === 'store' && <ShopScreen state={state} />}
        {screen === 'you' && <YouScreen state={state} />}
        {screen === 'radar' && <RadarScreen state={state} />}
      </main>
      </div>
      <nav class="nav" style={`--i:${idx};--n:${SCREENS.length}`}>
        {idx >= 0 && <span class="nav-ind" key={idx} />}
        {SCREENS.map((s) => (
          <button key={s.key} class={screen === s.key ? 'on' : ''} aria-current={screen === s.key ? 'page' : undefined} onClick={() => setScreen(s.key)}>
            <Icon name={s.icon} />{s.name}
          </button>
        ))}
      </nav>
      <UndoBar undo={state.undo} />
      <div class="toasts" aria-live="polite">{state.toasts.map((t) => <div key={t.id} class={`toast ${t.tone}`}>{t.tone === 'ach' && <i class="ach-hex" />}{t.text}</div>)}</div>
      {state.checkin && <Checkin state={state} />}
      <Moments state={state} />
    </>
  );
}

S.loadState().then((st) => { applyTheme(st.settings.theme); render(<App />, document.getElementById('app')); });
