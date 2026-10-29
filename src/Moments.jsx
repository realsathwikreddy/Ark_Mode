import { useEffect, useRef, useState } from 'preact/hooks';
import * as S from './store.js';
import { BossArt } from './bosses.jsx';
import { burst } from './fx.js';
import { scramble } from './dust.js';
import { fmtDate } from './ui.jsx';
import * as E from './engine.js';

// Shows the first queued moment full-screen; tapping the button dismisses it.
export function Moments({ state }) {
  const m = state.queue?.[0];
  if (!m || state.checkin) return null;
  const close = () => S.dismissOverlay(m.id);
  if (m.kind === 'level') return <Level m={m} close={close} />;
  if (m.kind === 'death') return <Death m={m} close={close} state={state} />;
  if (m.kind === 'focus') return <Focus m={m} close={close} />;
  if (m.kind === 'bossDown') return <BossDown m={m} close={close} />;
  if (m.kind === 'bossEscape') return <BossEscape m={m} close={close} />;
  if (m.kind === 'bossArrive') return <BossArrive m={m} close={close} />;
  if (m.kind === 'summary') return <Summary m={m} close={close} />;
  return null;
}

function useBurstOnMount(color, n = 26, delay = 120) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height / 2, color, n, 130);
    }, delay);
    return () => clearTimeout(t);
  }, []);
  return ref;
}

function Level({ m, close }) {
  const ref = useBurstOnMount('var(--cy)', 50, 200);
  const num = useRef(null);
  useEffect(() => { scramble(num.current, String(m.lvl), 800); }, []);
  const newTitle = E.TITLES.find(([min]) => min === m.lvl);
  return (
    <div class="moment level" role="dialog" aria-label={`Level ${m.lvl}`} onClick={close}>
      <div class="flashbang" />
      <div class="rays" />
      <div class="moment-ring" /><div class="moment-ring" /><div class="moment-ring" />
      <div class="moment-big" ref={(el) => { ref.current = el; num.current = el; }}>{m.lvl}</div>
      <h2>Level {m.lvl}</h2>
      {newTitle ? <div class="title-new">New title unlocked<b>{newTitle[1]}</b></div> : <p>Health refilled to full.</p>}
      <button class="btn" onClick={close}>Keep going</button>
    </div>
  );
}

function Death({ m, close }) {
  return (
    <div class="moment death" role="dialog" aria-label="Out of health">
      <svg class="crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M52 0 L47 18 L55 30 L44 46 L53 60 L46 78 L51 100" />
        <path d="M47 18 L30 26 L22 22 M55 30 L72 36 L80 31 M44 46 L28 54 M53 60 L70 70 L78 68" />
      </svg>
      <div class="moment-big">0</div>
      <h2>Out of health</h2>
      <p>You dropped to level {m.lvl} and lost all your gold. Health is back to full, so start again from here.</p>
      <button class="btn" onClick={close}>Start again</button>
    </div>
  );
}

function Focus({ m, close }) {
  const ref = useBurstOnMount(`var(--s-${m.subj || 'm'})`, 30, 60);
  return (
    <div class="moment" role="dialog" aria-label="Focus session done">
      <div class="moment-ring" style={`border-color:var(--s-${m.subj || 'm'});box-shadow:0 0 24px var(--s-${m.subj || 'm'})`} />
      <div class="moment-big" ref={ref}>{m.min}</div>
      <h2>{m.min} minutes of {m.label || 'focus'}</h2>
      <div class="moment-gain"><span class="xp">+{m.exp} XP</span><span class="gp">+{m.gp.toFixed(1)} gold</span></div>
      <button class="btn" onClick={close}>Logged</button>
    </div>
  );
}

function BossDown({ m, close }) {
  const ref = useBurstOnMount('var(--mg)', 40, 450);
  return (
    <div class="moment" role="dialog" aria-label={`${m.name} defeated`}>
      <div ref={ref}><BossArt n={m.n} class="shatter" /></div>
      <h2>{m.name} defeated</h2>
      <p>PT-{m.n}'s boss is down before the paper.</p>
      <div class="moment-gain"><span class="xp">+{m.exp} XP</span><span class="gp">+{m.gp} gold</span></div>
      <button class="btn" onClick={close}>Claim</button>
    </div>
  );
}

function BossEscape({ m, close }) {
  return (
    <div class="moment" role="dialog" aria-label={`${m.name} escaped`}>
      <BossArt n={m.n} class="dim" />
      <h2>{m.name} escaped</h2>
      <p>It got away with {m.hp} of {m.maxHp} health left. No reward this week, and no penalty either.</p>
      <button class="btn" onClick={close}>Next week</button>
    </div>
  );
}

function BossArrive({ m, close }) {
  return (
    <div class="moment" role="dialog" aria-label={`${m.name} arrives`}>
      <BossArt n={m.n} class="arrive" />
      <h2>{m.name}</h2>
      <p>PT-{m.n}'s boss has {m.maxHp} health. Every task you finish hits it. Every daily you miss lets it hit back. Beat it by {fmtDate(m.end, true)}.</p>
      <button class="btn" onClick={close}>Fight</button>
    </div>
  );
}

function Summary({ m, close }) {
  return (
    <div class="moment" role="dialog" aria-label="Yesterday">
      <h2>{m.day === E.addDays(S.today(), -1) ? 'Yesterday' : fmtDate(m.day, true)}</h2>
      <p>{m.rest ? 'You were resting, so nothing was lost.' : m.due && m.done === m.due ? 'Every daily done.' : m.due ? `${m.due - m.done} ${m.due - m.done === 1 ? 'daily' : 'dailies'} missed.` : 'Here is how yesterday went.'}</p>
      <div class="summary">
        <div class="stat"><div class="stat-v">{m.done}/{m.due}</div><div class="stat-l">Dailies</div></div>
        <div class="stat"><div class="stat-v" style={m.hpLost ? 'color:var(--hp)' : ''}>{m.hpLost ? `−${m.hpLost}` : '0'}</div><div class="stat-l">Health lost{m.bossHit ? `, ${m.bossHit} from the boss` : ''}</div></div>
        <div class="stat"><div class="stat-v">{m.xp}</div><div class="stat-l">XP earned</div></div>
        <div class="stat"><div class="stat-v">{Math.floor(m.focusMin / 60)}h {m.focusMin % 60}m</div><div class="stat-l">Focused</div></div>
        {m.bossName && <div class="stat" style="grid-column:1/-1"><div class="stat-v" style="color:var(--mg)">{m.bossDmg}</div><div class="stat-l">Damage dealt to {m.bossName}</div></div>}
      </div>
      <button class="btn" onClick={close}>Start today</button>
    </div>
  );
}

// The boss strip at the top of the Tasks screen.
export function BossCard({ state }) {
  const b = state.boss;
  const today = S.today();
  const [hitKey, setHitKey] = useState(0);
  const fx = state.bossFx;
  useEffect(() => { if (fx) setHitKey(fx.at); }, [fx?.at]);

  if (!b || b.status !== 'active') {
    const next = state.pts.map((pt) => ({ pt, w: E.bossWindow(pt) })).find(({ w }) => w && w.start > today);
    const last = b && b.status !== 'active' ? b : null;
    return (
      <section class="boss none">
        <BossArt n={next ? next.pt.n : last ? last.n : 13} class="dim" />
        <div class="boss-info">
          <div class="boss-k">{last ? `${last.name} ${last.status === 'defeated' ? 'defeated' : 'escaped'}` : 'No boss right now'}</div>
          <div class="boss-n">{next ? `PT-${next.pt.n} boss arrives ${fmtDate(next.w.start, true)}` : 'No more PT bosses scheduled'}</div>
        </div>
      </section>
    );
  }
  const daysLeft = E.daysBetween(today, b.end);
  const recent = fx && Date.now() - fx.at < 1500;
  return (
    <section class={`boss ${recent && fx.amount > 0 ? 'hit' : ''}`} key={`b${hitKey}`}>
      <BossArt n={b.n} />
      <div class="boss-info">
        <div class="boss-k">This week's boss, PT-{b.n}</div>
        <div class="boss-n">{b.name}</div>
        <div class="rail"><div class="fill bhp" style={`width:${(b.hp / b.maxHp) * 100}%`} /></div>
        <div class="boss-m"><span>{b.hp} / {b.maxHp} HP</span><span>{daysLeft <= 0 ? 'Last day' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`}</span></div>
      </div>
      {recent && <span class={`boss-dmg ${fx.amount < 0 ? 'heal' : ''}`}>{fx.amount > 0 ? `−${fx.amount}` : `+${-fx.amount}`}</span>}
    </section>
  );
}
