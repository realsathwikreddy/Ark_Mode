import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './store.js';
import { Sheet } from './ui.jsx';
import { arkListen, arkStopListening, arkCancelListening, arkSpeak, arkHush, arkVoices, arkSetVoice, exactAlarmsOk, openExactAlarmSettings, isNative, haptic } from './native.js';
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
export function ArkOrb({ mode = 'idle', size = 92, level = 0 }) {
  return (
    <span class={`ark-orb ${mode}`} style={`--s:${size}px;--lv:${level.toFixed(2)}`} aria-hidden="true">
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
  const [heard, setHeard] = useState('');
  const [level, setLevel] = useState(0);
  const input = useRef(null);
  const end = useRef(null);
  const brain = hasBrain(state.settings) ? brainLabel(state.settings) : 'Offline';
  const rem = (state.reminders || []).filter((r) => r.at > Date.now());

  const [voiceOpen, setVoiceOpen] = useState(false);
  useEffect(() => { exactAlarmsOk().then(setExactOk); arkSetVoice(state.settings.arkVoiceName || ''); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [log.length, mode, !!heard]);
  useEffect(() => { if (autoListen) setTimeout(listen, 250); return () => { arkHush(); arkCancelListening(); S.releaseLock(); }; }, []);

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
    if (mode === 'listening') { arkStopListening(); return; } // tap again to finish early
    if (mode !== 'idle') return;
    if (!isNative) { input.current?.focus(); return; }
    arkHush();
    S.holdLock(); // the mic permission pop-up must not trip the app lock
    setHeard(''); setLevel(0);
    setMode('listening'); haptic('light');
    try {
      const said = await arkListen((e) => {
        if (e.partial != null) setHeard(e.partial);
        if (e.level != null) setLevel(e.level);
      });
      setMode('idle'); setHeard(''); setLevel(0);
      if (said) run(said);
    } catch (e) {
      setMode('idle'); setHeard(''); setLevel(0);
      setLog((l) => [...l, { who: 'ark', text: e.message || 'Couldn’t listen.', failed: [] }]);
    } finally {
      S.releaseLock();
    }
  }

  const send = (e) => { e?.preventDefault(); const t = text; setText(''); run(t); };

  return (
    <Sheet title="Ark" onClose={onClose}>
      <div class="ark">
        <div class="ark-top small muted">
          <span class={`ark-brain ${brain === 'Offline' ? 'off' : ''}`}>{brain === 'Offline' ? 'Offline mode' : `Brain: ${brain}`}</span>
          <span class="ark-voice">
            {isNative && <button class="link small" onClick={() => setVoiceOpen(!voiceOpen)}>Voice</button>}
            <label class="ark-voice"><input type="checkbox" checked={state.settings.arkVoice !== false} onChange={(e) => S.setSetting('arkVoice', e.target.checked)} /> Talk back</label>
          </span>
        </div>
        {voiceOpen && <VoicePicker state={state} />}

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
          {mode === 'listening' && heard && <div class="ark-msg you live"><div class="ark-bubble">{heard}</div></div>}
          {mode === 'thinking' && <div class="ark-msg ark"><div class="thinking"><i /><i /><i /></div></div>}
          <div ref={end} />
        </div>

        <button class="ark-orb-btn" onClick={listen} aria-label={mode === 'listening' ? 'Done talking' : 'Talk to Ark'} disabled={mode === 'thinking'}>
          <ArkOrb mode={mode} level={level} />
          <span class="small muted">{mode === 'listening' ? 'Listening… tap when done' : mode === 'thinking' ? 'Thinking…' : 'Tap to talk'}</span>
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

// Pick Ark's voice. Male voices are listed first; "Auto" picks the best male one installed.
function VoicePicker({ state }) {
  const [list, setList] = useState(null);
  const [all, setAll] = useState(false);
  const cur = state.settings.arkVoiceName || '';
  useEffect(() => { arkVoices().then(setList); }, []);
  const pick = async (name) => {
    S.setSetting('arkVoiceName', name);
    await arkSetVoice(name);
    arkSpeak('Hey Sathwik, this is Ark.');
  };
  if (!list) return <div class="ark-voices small muted">Loading voices…</div>;
  const voices = (list.voices || []).sort((a, b) => (b.male - a.male) || a.locale.localeCompare(b.locale));
  const male = voices.filter((v) => v.male);
  const shown = all ? voices : male;
  const label = (v) => `${v.male ? 'Male' : 'Voice'} · ${v.locale.replace('en-', '')} · ${v.name.replace(/^en-[a-z]{2}-x-/i, '').replace(/-(local|network)$/i, '')}${v.network ? ' (online)' : ''}`;
  return (
    <div class="ark-voices">
      <div class="chips">
        <button class={`chip ${!cur ? 'on' : ''}`} onClick={() => pick('')}>Auto (male)</button>
        {shown.map((v) => <button key={v.name} class={`chip ${cur === v.name ? 'on' : ''}`} onClick={() => pick(v.name)}>{label(v)}</button>)}
      </div>
      {!male.length && <p class="small muted" style="margin:8px 0 0">No male voice is installed. Install <b>Speech Recognition &amp; Synthesis by Google</b> from the Play Store, then set it as the preferred engine in Settings → Text-to-speech. Until then Ark uses a deeper pitch.</p>}
      <button class="link small" style="margin-top:6px" onClick={() => setAll(!all)}>{all ? 'Only male voices' : 'Show all voices'}</button>
    </div>
  );
}
