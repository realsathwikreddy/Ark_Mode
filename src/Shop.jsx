import { useState } from 'preact/hooks';
import * as S from './store.js';
import { Icon, Sheet, fmtGold } from './ui.jsx';

export function ShopScreen({ state }) {
  const [editing, setEditing] = useState(null);
  const gp = state.user.gp;
  return (
    <>
      <div class="section-head">
        <h1>Rewards</h1>
        <span class="gold"><span class="coin" />{fmtGold(gp)}</span>
      </div>
      <p class="muted small" style="margin:-4px 0 16px">Spend the gold you earn on breaks you've decided are worth it. Tap a reward's name to edit it.</p>
      {state.rewards.length === 0 ? (
        <div class="empty"><p>Add something you'd actually enjoy, and price it so it takes real work.</p><button class="btn small" onClick={() => setEditing({ id: S.uid(), text: '', notes: '', cost: 20 })}>Add a reward</button></div>
      ) : state.rewards.map((r) => (
        <div class="reward" key={r.id}>
          <button class="task-body" style="padding:0" onClick={() => setEditing(r)}>
            <span class="task-title">{r.text}</span>
            {r.notes && <span class="task-meta">{r.notes}</span>}
          </button>
          <button class="buy" disabled={gp < r.cost} onClick={() => S.buyReward(r.id)} aria-label={`Buy ${r.text} for ${r.cost} gold`}>
            <span class="coin" />{r.cost}
          </button>
        </div>
      ))}
      <button class="fab" aria-label="Add reward" onClick={() => setEditing({ id: S.uid(), text: '', notes: '', cost: 20 })}><Icon name="plus" /></button>
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
