// Theme list for the picker. Colours here only draw the swatches; themes.css does the real work.
export const THEMES = [
  { id: 'neon', name: 'Neon Line', bg: '#070a12', a: '#4ff0ff', b: '#ff4fd2', dark: true },
  { id: 'abyss', name: 'Abyss', bg: '#02121a', a: '#3df5d3', b: '#ff7a59', dark: true },
  { id: 'ember', name: 'Ember', bg: '#120b07', a: '#ff9a3d', b: '#ff3d6e', dark: true },
  { id: 'dusk', name: 'Dusk', bg: '#140a1c', a: '#ffb38a', b: '#b98cff', dark: true },
  { id: 'terminal', name: 'Terminal', bg: '#030803', a: '#39ff6a', b: '#ffb000', dark: true },
  { id: 'paper', name: 'Graph Paper', bg: '#fbfcfe', a: '#1f45b5', b: '#d23c3c', dark: false },
  { id: 'mono', name: 'Mono Bold', bg: '#f4f4f2', a: '#0a0a0a', b: '#ff2d2d', dark: false },
  { id: 'arctic', name: 'Arctic', bg: '#f2f7fb', a: '#1769d1', b: '#7a3ddb', dark: false },
];

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = t.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bg);
}

// Switch with a circular wipe from where you tapped (falls back to an instant switch).
export function switchTheme(id, x, y, commit) {
  const run = () => { applyTheme(id); commit(); };
  if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { run(); return; }
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(run);
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 650, easing: 'cubic-bezier(.7,0,.2,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}
