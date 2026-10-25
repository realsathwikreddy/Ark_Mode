// Imperative effects drawn on a fixed layer: floating numbers, flying coins, particle bursts.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function layer() {
  let el = document.getElementById('fx');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fx';
    document.body.appendChild(el);
  }
  return el;
}

export function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function float(x, y, text, cls = '') {
  const el = document.createElement('span');
  el.className = `fx-float ${cls}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  layer().appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

export function coins(x, y, n = 3) {
  const target = document.getElementById('gold-anchor');
  if (!target) return;
  const t = centerOf(target);
  if (reduced()) { pulse(target); return; }
  for (let i = 0; i < n; i++) {
    const c = document.createElement('span');
    c.className = 'fx-coin';
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    layer().appendChild(c);
    const jx = (Math.random() - 0.5) * 50;
    const jy = -20 - Math.random() * 40;
    const a = c.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: `translate(calc(-50% + ${jx}px), calc(-50% + ${jy}px)) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(calc(-50% + ${t.x - x}px), calc(-50% + ${t.y - y}px)) scale(.5)`, opacity: 0.9 },
      ],
      { duration: 650 + i * 90, easing: 'cubic-bezier(.55,0,.75,.4)', fill: 'forwards' },
    );
    a.onfinish = () => { c.remove(); if (i === n - 1) pulse(target); };
  }
}

function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

export function burst(x, y, color = 'var(--cy)', n = 18, spread = 90) {
  if (reduced()) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'fx-dot';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = color;
    p.style.boxShadow = `0 0 8px ${color}`;
    layer().appendChild(p);
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const dist = spread * (0.6 + Math.random() * 0.6);
    const a = p.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(.2)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' },
    );
    a.onfinish = () => p.remove();
  }
}
