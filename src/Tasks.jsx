import { useState } from 'preact/hooks';
import * as S from './store.js';
import * as E from './engine.js';
import { Icon, Sheet, fmtDate, relDay, DAY_LETTERS } from './ui.jsx';
import { tap } from './native.js';
import { sfx } from './sfx.js';
import { float, coins, centerOf } from './fx.js';
import { BossCard } from './Moments.jsx';

// Animate what a tap earned: floating XP, coins flying to the gold counter.
function showGain(el, gain) {
  if (!gain || !el) return;
  const { x, y } = centerOf(el);
  if (gain.exp > 0) {
    float(x + 36, y - 30, `+${gain.exp} XP`);
    coins(x, y, Math.max(1, Math.min(5, Math.round(gain.gp * 2))));
  } else if (gain.exp < 0) {
    float(x + 36, y - 30, `${gain.exp} XP`, 'bad');
  } else if (gain.hp < 0) {
    float(x + 36, y - 30, `${gain.hp} HP`, 'bad');
  }
}

const TABS = [
  { key: 'habit', name: 'Habits' },
  { key: 'daily', name: 'Dailies' },
  { key: 'todo', name: 'To-dos' },
];

export function TasksScreen({ state, tab, setTab }) {
  const [editing, setEditing] = useState(null);
  const today = S.today();
  const list = state.tasks.filter((t) => t.type === tab);
  const counts = {
    habit: state.tasks.filter((t) => t.type === 'habit').length,
    daily: state.tasks.filter((t) => t.type === 'daily' && E.isDue(t, today) && !t.completed).length,
    todo: state.tasks.filter((t) => t.type === 'todo' && !t.completed).length,
  };

  let ordered = list;
  if (tab === 'daily') {
    const due = list.filter((t) => E.isDue(t, today));
    const notDue = list.filter((t) => !E.isDue(t, today));
    ordered = [...due.filter((t) => !t.completed), ...due.filter((t) => t.completed), ...notDue];
  }
  if (tab === 'todo') {
    const open = list.filter((t) => !t.completed).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    ordered = [...open, ...list.filter((t) => t.completed)];
  }

  return (
    <>
      <BossCard state={state} />
      <div class="seg" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} class={tab === t.key ? 'on' : ''} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.name}{counts[t.key] > 0 && <span class="count">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      {ordered.length === 0 ? (
        <div class="empty">
          <p>{tab === 'habit' ? 'Habits are things you do any time. Tap + for good, − for bad.' : tab === 'daily' ? 'Dailies repeat on set days. Miss one and you lose health at the 3 AM reset.' : 'To-dos are one-off jobs. Leaving them open slowly makes them worth more.'}</p>
          <button class="btn small" onClick={() => setEditing(blank(tab, today))}>Add {tab === 'habit' ? 'a habit' : tab === 'daily' ? 'a daily' : 'a to-do'}</button>
        </div>
      ) : (
        <div class="tasks">
          {ordered.map((t) => <TaskRow key={t.id} task={t} today={today} onEdit={() => setEditing(t)} />)}
        </div>
      )}

      {tab === 'todo' && list.some((t) => t.completed) && (
        <div style="margin-top:14px;text-align:center"><button class="link" onClick={S.clearDoneTodos}>Clear finished to-dos</button></div>
      )}

      <button class="fab" aria-label="Add task" onClick={() => setEditing(blank(tab, today))}><Icon name="plus" /></button>
      {editing && <TaskEditor task={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaskRow({ task, today, onEdit }) {
  const band = `band-${E.valueBand(task.value)}`;
  const due = task.type === 'daily' ? E.isDue(task, today) : true;
  const cls = `task ${band} ${task.completed ? 'done' : ''} ${!due ? 'notdue' : ''}`;
  const list = task.checklist || [];
  const doneCount = list.filter((c) => c.done).length;
  const showList = list.length > 0 && !task.completed && (task.type === 'todo' || due);

  const meta = [];
  if (task.type === 'daily') {
    if (!due) meta.push(<span>Not due today</span>);
    if (task.streak > 0) meta.push(<span>{task.streak} day streak</span>);
  }
  if (task.type === 'habit' && (task.countUp || task.countDown)) meta.push(<span>Today: +{task.countUp || 0} / −{task.countDown || 0}</span>);
  if (task.type === 'todo' && task.due && !task.completed) meta.push(<span class={task.due < today ? 'late' : ''}>Due {relDay(task.due, today)}</span>);
  if (list.length) meta.push(<span>{doneCount}/{list.length}</span>);
  if (task.priority !== 'easy') meta.push(<span>{E.PRIORITY_LABEL[task.priority]}</span>);

  const [popped, setPopped] = useState(false);
  const tick = (e) => {
    const el = e.currentTarget;
    const undo = task.completed;
    const gain = S.toggleTask(task.id);
    if (undo) { sfx.untick(); showGain(el, gain); return; }
    tap(); sfx.tick(); setTimeout(() => sfx.coin(), 120);
    setPopped(true); setTimeout(() => setPopped(false), 400);
    showGain(el, gain);
  };
  const habit = (dir) => (e) => {
    const el = e.currentTarget;
    const gain = S.scoreHabit(task.id, dir);
    if (dir === 'up') { tap(); sfx.tick(); setTimeout(() => sfx.coin(), 120); }
    showGain(el, gain);
  };

  return (
    <div>
      <div class={`${cls} ${popped ? 'popped' : ''}`}>
        {task.type === 'habit' ? (
          <span class="hb-wrap"><button class="hb" disabled={!task.up} aria-label={`Score ${task.text} up`} onClick={habit('up')}>+</button></span>
        ) : (
          <button class="tick" aria-label={task.completed ? `Untick ${task.text}` : `Tick ${task.text}`} onClick={tick}>
            <span class="box">{task.completed && <Icon name="check" size={16} stroke={3} />}</span>
          </button>
        )}
        <button class="task-body" onClick={onEdit}>
          <span class="task-title">{task.text}</span>
          {meta.length > 0 && <span class="task-meta">{meta}</span>}
        </button>
        {task.type === 'habit' && (
          <span class="hb-wrap"><button class="hb minus" disabled={!task.down} aria-label={`Score ${task.text} down`} onClick={habit('down')}>−</button></span>
        )}
      </div>
      {showList && (
        <div class="checklist">
          {list.map((c) => (
            <button key={c.id} class={`check-item ${c.done ? 'on' : ''}`} onClick={() => { sfx.tick(); S.toggleChecklist(task.id, c.id); }}>
              <span class="mini">{c.done && <Icon name="check" size={11} stroke={3} />}</span>
              <span>{c.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function blank(type, today) {
  const base = { id: S.uid(), type, text: '', notes: '', priority: 'easy', value: 0, createdAt: Date.now(), checklist: [] };
  if (type === 'habit') return { ...base, up: true, down: true, countUp: 0, countDown: 0 };
  if (type === 'daily') return { ...base, frequency: 'weekly', days: [true, true, true, true, true, true, true], everyX: 1, startDate: today, streak: 0, completed: false };
  return { ...base, due: '', completed: false };
}

function TaskEditor({ task, onClose }) {
  const [t, setT] = useState(task);
  const [item, setItem] = useState('');
  const isNew = !S.getState().tasks.some((x) => x.id === task.id);
  const set = (patch) => setT({ ...t, ...patch });
  const typeName = t.type === 'habit' ? 'habit' : t.type === 'daily' ? 'daily' : 'to-do';

  const save = () => {
    if (!t.text.trim()) return;
    S.saveTask({ ...t, text: t.text.trim() });
    onClose();
  };
  const addItem = () => {
    if (!item.trim()) return;
    set({ checklist: [...(t.checklist || []), { id: S.uid(), text: item.trim(), done: false }] });
    setItem('');
  };

  return (
    <Sheet title={isNew ? `New ${typeName}` : `Edit ${typeName}`} onClose={onClose}
      actions={<>
        {!isNew && <button class="btn danger" onClick={() => { S.deleteTask(t.id); onClose(); }}>Delete</button>}
        <button class="btn" disabled={!t.text.trim()} onClick={save}>{isNew ? 'Add' : 'Save'}</button>
      </>}>
      <label class="field">Title
        <input class="input" value={t.text} onInput={(e) => set({ text: e.target.value })} placeholder={t.type === 'habit' ? 'Solved a tough question' : t.type === 'daily' ? 'Revise class notes' : 'Finish integration DPP'} autoFocus />
      </label>
      <label class="field">Notes
        <textarea class="input" value={t.notes} onInput={(e) => set({ notes: e.target.value })} />
      </label>

      <div class="field"><span>Difficulty</span>
        <div class="chips">
          {Object.keys(E.PRIORITY).map((p) => (
            <button key={p} class={`chip ${t.priority === p ? 'on' : ''}`} onClick={() => set({ priority: p })}>{E.PRIORITY_LABEL[p]}</button>
          ))}
        </div>
      </div>

      {t.type === 'habit' && (
        <div class="field"><span>Buttons</span>
          <div class="chips">
            <button class={`chip ${t.up ? 'on' : ''}`} onClick={() => set({ up: t.down ? !t.up : true })}>+ Good</button>
            <button class={`chip ${t.down ? 'on' : ''}`} onClick={() => set({ down: t.up ? !t.down : true })}>− Bad</button>
          </div>
        </div>
      )}

      {t.type === 'daily' && (
        <>
          <div class="field"><span>Repeats</span>
            <div class="chips">
              <button class={`chip ${t.frequency === 'weekly' ? 'on' : ''}`} onClick={() => set({ frequency: 'weekly' })}>On set weekdays</button>
              <button class={`chip ${t.frequency === 'every' ? 'on' : ''}`} onClick={() => set({ frequency: 'every' })}>Every few days</button>
            </div>
          </div>
          {t.frequency === 'weekly' ? (
            <div class="field"><span>Days</span>
              <div class="days">
                {DAY_LETTERS.map((d, i) => (
                  <button key={i} class={`chip ${t.days[i] ? 'on' : ''}`} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} onClick={() => set({ days: t.days.map((v, j) => (j === i ? !v : v)) })}>{d}</button>
                ))}
              </div>
            </div>
          ) : (
            <div class="row" style="margin-bottom:14px">
              <label class="field grow" style="margin:0">Every
                <input class="input" type="number" min="1" max="30" value={t.everyX} onInput={(e) => set({ everyX: Math.max(1, +e.target.value || 1) })} />
              </label>
              <label class="field grow" style="margin:0">days, starting
                <input class="input" type="date" value={t.startDate} onInput={(e) => set({ startDate: e.target.value })} />
              </label>
            </div>
          )}
        </>
      )}

      {t.type === 'todo' && (
        <label class="field">Due date
          <input class="input" type="date" value={t.due || ''} onInput={(e) => set({ due: e.target.value })} />
        </label>
      )}

      {t.type !== 'habit' && (
        <div class="field"><span>Checklist</span>
          {(t.checklist || []).map((c) => (
            <div key={c.id} class="row">
              <input class="input grow" value={c.text} onInput={(e) => set({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })} />
              <button class="link" aria-label="Remove item" onClick={() => set({ checklist: t.checklist.filter((x) => x.id !== c.id) })}><Icon name="trash" size={18} /></button>
            </div>
          ))}
          <div class="row">
            <input class="input grow" value={item} placeholder="Add an item" onInput={(e) => setItem(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addItem()} />
            <button class="btn ghost small" onClick={addItem}>Add</button>
          </div>
        </div>
      )}

      {!isNew && (
        <div class="row" style="margin-bottom:6px">
          <button class="btn ghost small" onClick={() => { S.moveTask(t.id, -1); }}><Icon name="up" size={16} /> Move up</button>
          <button class="btn ghost small" onClick={() => { S.moveTask(t.id, 1); }}><Icon name="down" size={16} /> Move down</button>
          {t.type === 'daily' && <span class="small muted grow" style="text-align:right">Streak {t.streak || 0}</span>}
        </div>
      )}
    </Sheet>
  );
}

// "Did you do these yesterday?" — shown once after the 3 AM reset, before damage is applied.
export function Checkin({ state }) {
  const ids = state.checkin.ids;
  const [done, setDone] = useState([]);
  const tasks = state.tasks.filter((t) => ids.includes(t.id));
  const toggle = (id) => setDone(done.includes(id) ? done.filter((x) => x !== id) : [...done, id]);
  return (
    <div class="scrim">
      <div class="sheet" role="dialog" aria-label="Yesterday's dailies">
        <div class="sheet-grip" />
        <h2 style="margin-bottom:6px">Did you finish these {fmtDate(state.checkin.day, true)}?</h2>
        <p class="muted small" style="margin:0 0 14px">Tick what you actually did. Anything left open costs health when you continue.</p>
        <div class="tasks">
          {tasks.map((t) => (
            <div key={t.id} class={`task band-${E.valueBand(t.value)} ${done.includes(t.id) ? 'done' : ''}`}>
              <button class="tick" onClick={() => toggle(t.id)} aria-label={`Mark ${t.text}`}>
                <span class="box">{done.includes(t.id) && <Icon name="check" size={16} stroke={3} />}</span>
              </button>
              <div class="task-body"><span class="task-title">{t.text}</span></div>
            </div>
          ))}
        </div>
        <div class="sheet-actions"><button class="btn" onClick={() => S.finishCheckin(done)}>Start today</button></div>
      </div>
    </div>
  );
}
