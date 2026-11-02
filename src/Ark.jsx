import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './store.js';
import { Sheet } from './ui.jsx';
import { arkListen, arkSpeak, arkHush, exactAlarmsOk, openExactAlarmSettings, isNative, haptic } from './native.js';
import { hasBrain, brainLabel } from './brain.js';
import { whenWords } from './arkparse.js';
import { sfx } from './sfx.js';

const TRY = [
  'Remind me in 20 minutes to drink water',
  'What’s next today?',
  'Start 50 minutes of physics',
  'Add a to-do: revise wave optics tomorrow',
  'How far is the boss?',
];

// The orb: idle, listening or thinking.
export function ArkOrb({ mode = 'idle', size = 92 }) {
  return (
    <span class={`ark-orb ${mode}`} style={`--s:${size}px`} aria-hidden="true">
      <i class="ark-ring r1" /><i class="ark-ring r2" /><i class="ark-ring r3" />
      <span class="ark-core">
        <svg viewBox="0 0 24 24" width={size * 0.34} height={size * 0.34}><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" fill="currentColor" /><path d="M17 11a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z" fill="currentColor" /></svg>
      </span>
    </span>
  );
}

export function ArkSheet({ state, onClose, go, autoListen }) {
  const [log, setLog] = useState([]);
  const [mode, setMode] = useState('idle');
  const [text, setText] = useState('');
  const [exactOk, setExactOk] = useState(true);
  const input = useRef(null);
  const end = useRef(null);
  const brain = hasBrain(state.settings) ? brainLabel(state.settings) : 'Offline';
  const rem = (state.reminders || []).filter((r) => r.at > Date.now());

  useEffect(() => { exactAlarmsOk().then(setExactOk); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [log.length, mode]);
  useEffect(() => { if (autoListen) setTimeout(listen, 250); return () => { arkHush(); }; }, []);

  const run = async (said) => {
    said = said.trim();
    if (!said) return;
    setLog((l) => [...l, { who: 'you', text: said }]);
    setMode('thinking');
    const r = await S.runArk(said);
    setMode('idle');
    setLog((l) => [...l, { who: 'ark', text: r.say, done: r.done, failed: r.failed, via: r.via }]);
    if (state.settings.arkVoice !== false) arkSpeak(r.say);
    if (r.open) {
      const [screen, sub] = r.open.split(':');
      setTimeout(() => { go(screen, sub); if (!r.say || r.done.length) onClose(); }, r.say ? 1600 : 200);
    }
  };

  async function listen() {
    if (mode !== 'idle') return;
    if (!isNative) { input.current?.focus(); return; }
    arkHush();
    setMode('listening'); haptic('light'); sfx.tick?.();
    try {
      const heard = await arkListen('Talk to Ark');
      setMode('idle');
      if (heard) run(heard);
    } catch (e) {
      setMode('idle');
      setLog((l) => [...l, { who: 'ark', text: e.message || 'Couldn’t listen.', failed: [] }]);
    }
  }

  const send = (e) => { e?.preventDefault(); const t = text; setText(''); run(t); };

  return (
    <Sheet title="Ark" onClose={onClose}>
      <div class="ark">
        <div class="ark-top small muted">
          <span class={`ark-brain ${brain === 'Offline' ? 'off' : ''}`}>{brain === 'Offline' ? 'Offline mode' : `Brain: ${brain}`}</span>
          <label class="ark-voice"><input type="checkbox" checked={state.settings.arkVoice !== false} onChange={(e) => S.setSetting('arkVoice', e.target.checked)} /> Talk back</label>
        </div>

        {!exactOk && (
          <button class="ark-warn" onClick={async () => { await openExactAlarmSettings(); setTimeout(() => exactAlarmsOk().then(setExactOk), 1500); }}>
            Reminders might arrive a few minutes late. Tap to allow <b>Alarms &amp; reminders</b> so they ring on time.
          </button>
        )}

        <div class="ark-log">
          {!log.length && (
            <div class="ark-empty">
              <p class="small muted" style="margin:0 0 10px">Tap the orb and talk, or type. Try:</p>
              <div class="ark-try">{TRY.map((t) => <button key={t} class="chip" onClick={() => run(t)}>{t}</button>)}</div>
              {brain === 'Offline' && <p class="small muted" style="margin:12px 0 0">Without an AI key Ark understands simple commands only. Add a free Gemini key in You → Ark’s brain.</p>}
            </div>
          )}
          {log.map((m, i) => (
            <div key={i} class={`ark-msg ${m.who}`}>
              <div class="ark-bubble">{m.text}</div>
              {m.done?.length > 0 && <ul class="ark-done">{m.done.map((d) => <li key={d}>{d}</li>)}</ul>}
              {m.who === 'ark' && m.via && <span class="ark-via">{m.via}</span>}
            </div>
          ))}
          {mode === 'thinking' && <div class="ark-msg ark"><div class="thinking"><i /><i /><i /></div></div>}
          <div ref={end} />
        </div>

        <button class="ark-orb-btn" onClick={listen} aria-label="Talk to Ark" disabled={mode === 'thinking'}>
          <ArkOrb mode={mode} />
          <span class="small muted">{mode === 'listening' ? 'Listening…' : mode === 'thinking' ? 'Thinking…' : 'Tap to talk'}</span>
        </button>

        <form class="ark-input row" onSubmit={send}>
          <input ref={input} class="input grow" value={text} onInput={(e) => setText(e.target.value)} placeholder="Or type to Ark…" enterKeyHint="send" />
          <button class="btn small" type="submit" disabled={!text.trim() || mode === 'thinking'}>Send</button>
        </form>

        {rem.length > 0 && (
          <div class="ark-rems">
            <div class="small muted" style="margin-bottom:6px">Reminders</div>
            {rem.map((r) => (
              <div key={r.id} class="ark-rem">
                <span class="grow"><b>{r.text}</b><span class="small muted"> {whenWords(r.at, Date.now())}</span></span>
                <button class="link" aria-label={`Cancel ${r.text}`} onClick={() => S.cancelReminder(r.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}
