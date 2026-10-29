import { useEffect } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { parseKey, keyOf } from './engine.js';

const paths = {
  home: <><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z" /></>,
  tasks: <><path d="M4 6h2M4 12h2M4 18h2" /><path d="M9 6h11M9 12h11M9 18h11" /></>,
  study: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></>,
  tests: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  shop: <><path d="M4 9h16l-1.2 10.2a1 1 0 0 1-1 .8H6.2a1 1 0 0 1-1-.8z" /><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" /></>,
  you: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.3-4 4.4-6 8-6s6.7 2 8 6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13" /></>,
};

export function Icon({ name, size = 22, stroke = 2 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Sheet({ title, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    window.__sheetClose = onClose; // Android back button closes the top sheet
    return () => { window.removeEventListener('keydown', onKey); if (window.__sheetClose === onClose) window.__sheetClose = null; };
  }, [onClose]);
  return createPortal(
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="sheet" role="dialog" aria-label={title}>
        <div class="sheet-grip" />
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="link" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
        {actions && <div class="sheet-actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

// The floating + button lives outside the animated screen so it always sits at the bottom right.
export function Fab({ label, onClick }) {
  return createPortal(<button class="fab" aria-label={label} onClick={onClick}><Icon name="plus" /></button>, document.body);
}

export function Switch({ checked, onChange, label }) {
  return (
    <label class="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function fmtDate(key, withDay = false) {
  if (!key) return '';
  const d = parseKey(key);
  return `${withDay ? DAYS[d.getDay()] + ' ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function relDay(key, today) {
  const diff = Math.round((parseKey(key) - parseKey(today)) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff < 0) return `${-diff} days ago`;
  return `in ${diff} days`;
}

export const fmtGold = (g) => (Math.floor(g * 10) / 10).toFixed(1);
export { keyOf };
