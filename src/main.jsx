import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { App as CapApp } from '@capacitor/app';
import './styles.css';
import * as S from './store.js';
import * as E from './engine.js';
import { Icon, fmtGold } from './ui.jsx';
import { TasksScreen, Checkin } from './Tasks.jsx';
import { ShopScreen } from './Shop.jsx';
import { TestsScreen } from './Tests.jsx';
import { StudyScreen } from './Study.jsx';
import { YouScreen } from './You.jsx';
import { scheduleReminders, askNotificationPermission, isNative } from './native.js';

const SCREENS = [
  { key: 'tasks', name: 'Tasks', icon: 'tasks' },
  { key: 'study', name: 'Study', icon: 'study' },
  { key: 'tests', name: 'Tests', icon: 'tests' },
  { key: 'shop', name: 'Rewards', icon: 'shop' },
  { key: 'you', name: 'You', icon: 'you' },
];

function Hero({ state }) {
  const u = state.user;
  const need = E.toNextLevel(u.lvl);
  const today = S.today();
  const open = state.tasks.filter((t) => E.isDue(t, today) && !t.completed).length;
  return (
    <header class="hero">
      <div class="hero-row">
        <div class="level"><span class="level-num">{u.lvl}</span><span class="level-label">Level</span></div>
        <div class="bars">
          <div>
            <div class="bar-top"><b>Health</b><span>{Math.max(0, Math.round(u.hp * 10) / 10)} / {E.MAX_HP}</span></div>
            <div class="rail"><div class="fill hp" style={`width:${(Math.max(0, u.hp) / E.MAX_HP) * 100}%`} /></div>
          </div>
          <div>
            <div class="bar-top"><b>Experience</b><span>{u.exp} / {need}</span></div>
            <div class="rail"><div class="fill xp" style={`width:${(u.exp / need) * 100}%`} /></div>
          </div>
        </div>
      </div>
      <div class="hero-foot">
        <span class="gold"><span class="coin" />{fmtGold(u.gp)}</span>
        {state.settings.restMode ? <span class="rest-pill">Resting, dailies paused</span> : <span>{open ? `${open} ${open === 1 ? 'daily' : 'dailies'} left today` : 'All dailies done'}</span>}
      </div>
    </header>
  );
}

function App() {
  const state = S.useStore();
  const [screen, setScreen] = useState('tasks');
  const [taskTab, setTaskTab] = useState('daily');

  useEffect(() => {
    S.checkDay();
    const t = setInterval(S.checkDay, 60000);
    const onVis = () => document.visibilityState === 'visible' && S.checkDay();
    document.addEventListener('visibilitychange', onVis);
    let subs = [];
    if (isNative) {
      CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) S.checkDay(); else S.flush(); }).then((h) => subs.push(h));
      CapApp.addListener('backButton', () => {
        if (window.__sheetClose) { window.__sheetClose(); return; }
        setScreen((s) => { if (s !== 'tasks') return 'tasks'; CapApp.minimizeApp(); return s; });
      }).then((h) => subs.push(h));
      if (state.settings.reminders) askNotificationPermission();
    }
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); subs.forEach((h) => h.remove()); };
  }, []);

  // Keep the evening reminder in sync with what's still open.
  useEffect(() => { const t = setTimeout(() => scheduleReminders(state), 800); return () => clearTimeout(t); },
    [state.tasks, state.settings.reminders, state.settings.reminderTime, state.settings.restMode, state.lastCron]);

  return (
    <>
      <Hero state={state} />
      <main class="main">
        {screen === 'tasks' && <TasksScreen state={state} tab={taskTab} setTab={setTaskTab} />}
        {screen === 'study' && <StudyScreen state={state} />}
        {screen === 'tests' && <TestsScreen state={state} />}
        {screen === 'shop' && <ShopScreen state={state} />}
        {screen === 'you' && <YouScreen state={state} />}
      </main>
      <nav class="nav">
        {SCREENS.map((s) => (
          <button key={s.key} class={screen === s.key ? 'on' : ''} aria-current={screen === s.key ? 'page' : undefined} onClick={() => setScreen(s.key)}>
            <Icon name={s.icon} />{s.name}
          </button>
        ))}
      </nav>
      <div class="toasts" aria-live="polite">{state.toasts.map((t) => <div key={t.id} class={`toast ${t.tone}`}>{t.text}</div>)}</div>
      {state.checkin && <Checkin state={state} />}
    </>
  );
}

S.loadState().then(() => render(<App />, document.getElementById('app')));
