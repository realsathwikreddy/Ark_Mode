import { useState } from 'preact/hooks';
import * as S from './store.js';
import * as E from './engine.js';
import { Icon, Sheet, Fab, fmtGold } from './ui.jsx';
import { burst, centerOf, float } from './fx.js';
import { FRAMES, Frame } from './frames.jsx';

// Store: the Health Potion, title frames, and your own rewards.
export function ShopScreen({ state }) {
  const [editing, setEditing] = useState(null);
  const gp = state.user.gp;
  const owned = state.store.owned;
  const full = state.user.hp >= E.MAX_HP;

  const potion = (e) => {
    const el = e.currentTarget;
    if (S.drinkPotion()) {
      const c = centerOf(el);
      burst(c.x, c.y, 'var(--hp)', 22, 90);
      float(c.x, c.y - 30, `+${E.POTION.hp} HP`, 'heal');
      const bar = document.querySelector('.fill.hp');
      if (bar) { const b = centerOf(bar); setTimeout(() => burst(b.x, b.y, 'var(--good)', 26, 60), 250); }
    }
  };
  const frame = (f) => (e) => {
    const el = e.currentTarget;
    if (owned.includes(f.id)) { S.equipFrame(f.id); return; }
    if (S.buyFrame(f.id)) { const c = centerOf(el); burst(c.x, c.y, 'var(--gold)', 30, 110); }
  };

  return (
    <>
      <div class="section-head">
        <h1>Store</h1>
        <span class="gold"><span class="coin" />{fmtGold(gp)}</span>
      </div>

      <div class="section">
        <div class="item potion-item">
          <svg class="potion" viewBox="0 0 40 52" aria-hidden="true">
            <path d="M15 4h10M16 4v10L6 30a12 12 0 0 0 10 18h8a12 12 0 0 0 10-18L24 14V4" />
            <path class="liquid" d="M9 32h22a10 10 0 0 1-7 14h-8a10 10 0 0 1-7-14z" />
            <circle class="bub" cx="17" cy="38" r="1.6" /><circle class="bub b2" cx="23" cy="41" r="1.2" />
          </svg>
          <div class="grow">
            <div class="task-title">Health Potion</div>
            <div class="task-meta">{full ? 'Your health is full' : `+${E.POTION.hp} health, up to ${E.MAX_HP}`}</div>
          </div>
          <button class="buy" disabled={gp < E.POTION.cost || full} onClick={potion} aria-label={`Drink a Health Potion for ${E.POTION.cost} gold`}>
            <span class="coin" />{E.POTION.cost}
          </button>
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Title frames</h2><span class="small muted">Tap an owned frame to wear it</span></div>
        <div class="frames">
          {FRAMES.map((f) => {
            const have = owned.includes(f.id);
            const on = state.store.frame === f.id;
            return (
              <button key={f.id} class={`frame-card ${have ? 'have' : ''} ${on ? 'on' : ''}`} onClick={frame(f)} disabled={!have && gp < f.cost} aria-label={have ? `${on ? 'Take off' : 'Wear'} ${f.name}` : `Buy ${f.name} for ${f.cost} gold`}>
                <span class="frame-prev"><Frame id={f.id} /><span class="frame-lvl">{state.user.lvl}</span></span>
                <span class="frame-name">{f.name}</span>
                <span class="frame-cost">{have ? (on ? 'Wearing' : 'Owned') : <><span class="coin" />{f.cost}</>}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div class="section">
        <div class="section-head"><h2>Your rewards</h2><button class="link" onClick={() => setEditing({ id: S.uid(), text: '', notes: '', cost: 20 })}>Add reward</button></div>
        {state.rewards.length === 0 ? (
          <div class="empty"><p>Add something you'd actually enjoy, and price it so it takes real work.</p></div>
        ) : state.rewards.map((r) => (
          <div class="reward" key={r.id}>
            <button class="task-body" style="padding:0" onClick={() => setEditing(r)}>
              <span class="task-title">{r.text}</span>
              {r.notes && <span class="task-meta">{r.notes}</span>}
            </button>
            <button class="buy" disabled={gp < r.cost} onClick={(e) => { const el = e.currentTarget; if (S.buyReward(r.id)) { const c = centerOf(el); burst(c.x, c.y, 'var(--gold)', 18, 70); } }} aria-label={`Buy ${r.text} for ${r.cost} gold`}>
              <span class="coin" />{r.cost}
            </button>
          </div>
        ))}
      </div>
      <Fab label="Add reward" onClick={() => setEditing({ id: S.uid(), text: '', notes: '', cost: 20 })} />
      {editing && <RewardEditor reward={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RewardEditor({ reward, onClose }) {
  const [r, setR] = useState(reward);
  const isNew = !S.getState().rewards.some((x) => x.id === reward.id);
  const ok = r.text.trim() && r.cost > 0;
  return (
    <Sheet title={isNew ? 'New reward' : 'Edit reward'} onClose={onClose}
      actions={<>
        {!isNew && <button class="btn danger" onClick={() => { S.deleteReward(r.id); onClose(); }}>Delete</button>}
        <button class="btn" disabled={!ok} onClick={() => { S.saveReward({ ...r, text: r.text.trim() }); onClose(); }}>{isNew ? 'Add' : 'Save'}</button>
      </>}>
      <label class="field">Reward
        <input class="input" value={r.text} onInput={(e) => setR({ ...r, text: e.target.value })} placeholder="One episode" autoFocus />
      </label>
      <label class="field">Notes
        <input class="input" value={r.notes} onInput={(e) => setR({ ...r, notes: e.target.value })} />
      </label>
      <label class="field">Cost in gold
        <input class="input" type="number" min="1" value={r.cost} onInput={(e) => setR({ ...r, cost: Math.max(0, +e.target.value || 0) })} />
      </label>
      <p class="small muted" style="margin:0 0 8px">For scale: an easy task pays about 1 gold, a hard one about 2, and a 50-minute focus session about 2.</p>
    </Sheet>
  );
}
