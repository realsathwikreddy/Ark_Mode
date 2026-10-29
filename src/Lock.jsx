import { useEffect, useState } from 'preact/hooks';
import * as S from './store.js';
import { Sheet, Switch } from './ui.jsx';
import { bioAvailable, bioVerify, haptic } from './native.js';
import { sfx } from './sfx.js';

function Pad({ value, onDigit, onBack, extra }) {
  return (
    <div class="pinpad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} onClick={() => onDigit(String(n))}>{n}</button>)}
      {extra || <span />}
      <button onClick={() => onDigit('0')}>0</button>
      <button onClick={onBack} aria-label="Delete">⌫</button>
    </div>
  );
}
const Dots = ({ n, shake }) => <div class={`pindots ${shake ? 'shake' : ''}`}>{[0, 1, 2, 3].map((i) => <i key={i} class={i < n ? 'on' : ''} />)}</div>;

// Full-screen lock shown on open (and after the app has been away for a while).
export function LockScreen({ state }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [bio, setBio] = useState(false);
  const useBio = state.settings.lock.bio;

  const tryBio = async () => { if (await bioVerify()) { sfx.chime(); S.unlock(); } };
  useEffect(() => { bioAvailable().then((ok) => { setBio(ok); if (ok && useBio) tryBio(); }); }, []);

  const digit = async (d) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    haptic('light');
    if (next.length === 4) {
      if (await S.checkPin(next)) { sfx.chime(); S.unlock(); }
      else { setShake(true); haptic('warning'); sfx.bad(); setTimeout(() => { setShake(false); setPin(''); }, 450); }
    }
  };
  return (
    <div class="lock" role="dialog" aria-label="Ark Mode is locked">
      <svg class="lock-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="28" width="36" height="28" rx="6" /><path d="M22 28v-8a10 10 0 0 1 20 0v8" /><circle cx="32" cy="42" r="3" /></svg>
      <h2>Enter your PIN</h2>
      <Dots n={pin.length} shake={shake} />
      <Pad value={pin} onDigit={digit} onBack={() => setPin(pin.slice(0, -1))} extra={bio && useBio ? <button onClick={tryBio} aria-label="Use fingerprint">◉</button> : null} />
    </div>
  );
}

// Settings sheet: set a 4-digit PIN (asked twice) and optionally fingerprint.
export function LockSetup({ state, onClose }) {
  const lock = state.settings.lock;
  const [step, setStep] = useState(lock.enabled ? 'manage' : 'new');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  useEffect(() => { bioAvailable().then(setBioOk); }, []);

  const digit = async (d) => {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    if (step === 'new') { setFirst(next); setPin(''); setStep('confirm'); }
    else if (step === 'confirm') {
      if (next === first) { await S.setPin(next, bioOk); sfx.chime(); setStep('manage'); setPin(''); }
      else { setShake(true); setTimeout(() => { setShake(false); setPin(''); setStep('new'); }, 450); }
    }
  };

  return (
    <Sheet title="App lock" onClose={onClose}>
      {step === 'manage' ? (
        <>
          <div class="setting">
            <div class="grow"><div>Lock is on</div><div class="small muted">Asks for your PIN when you open Ark Mode, and after it's been in the background for 30 seconds.</div></div>
          </div>
          {bioOk && (
            <div class="setting">
              <div class="grow"><div>Use fingerprint</div><div class="small muted">Your PIN still works as a backup.</div></div>
              <Switch checked={state.settings.lock.bio} onChange={S.setLockBio} label="Use fingerprint" />
            </div>
          )}
          <div class="sheet-actions">
            <button class="btn ghost" onClick={() => { setStep('new'); setPin(''); }}>Change PIN</button>
            <button class="btn danger" onClick={() => { S.disableLock(); onClose(); }}>Turn off lock</button>
          </div>
        </>
      ) : (
        <div style="text-align:center">
          <p class="muted" style="margin:0 0 14px">{step === 'new' ? 'Choose a 4-digit PIN.' : 'Enter it again to confirm.'}</p>
          <Dots n={pin.length} shake={shake} />
          <Pad value={pin} onDigit={digit} onBack={() => setPin(pin.slice(0, -1))} />
          <p class="small muted" style="margin:14px 0 0">If you forget it, the only way back in is your fingerprint, so pick something you'll remember.</p>
        </div>
      )}
    </Sheet>
  );
}
