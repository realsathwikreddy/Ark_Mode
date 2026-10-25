// Six original line-art bosses, one per remaining PT (13–18). Later PTs cycle through them.
// Each shape is [tag, attrs, role]; role picks the colour: main (magenta), sub (cyan), eye, pupil.

const W = [
  ['ellipse', { cx: 60, cy: 60, rx: 54, ry: 16, transform: 'rotate(-14 60 60)' }, 'sub'],
  ['path', { d: 'M44 26 L34 6 M76 26 L86 6' }, 'main'],
  ['polygon', { points: '60,14 98,56 60,108 22,56' }, 'main'],
  ['path', { d: 'M22 56 L60 70 L98 56 M60 70 L60 108' }, 'facet'],
  ['circle', { cx: 60, cy: 50, r: 11 }, 'eye'],
  ['circle', { cx: 62, cy: 51, r: 4.5 }, 'pupil'],
];
const SENTINEL = [
  ['circle', { cx: 16, cy: 40, r: 6 }, 'sub'],
  ['circle', { cx: 104, cy: 40, r: 6 }, 'sub'],
  ['path', { d: 'M22 40 L44 52 M98 40 L76 52' }, 'sub'],
  ['polygon', { points: '60,10 106,100 14,100' }, 'main'],
  ['polygon', { points: '60,96 80,58 40,58' }, 'facet'],
  ['circle', { cx: 60, cy: 72, r: 10 }, 'eye'],
  ['circle', { cx: 60, cy: 73, r: 4 }, 'pupil'],
];
const KNIGHT = [
  ['ellipse', { cx: 60, cy: 60, rx: 56, ry: 13, transform: 'rotate(28 60 60)' }, 'sub'],
  ['ellipse', { cx: 60, cy: 60, rx: 56, ry: 13, transform: 'rotate(-28 60 60)' }, 'sub'],
  ['polygon', { points: '60,12 100,35 100,85 60,108 20,85 20,35' }, 'main'],
  ['path', { d: 'M34 52 L86 52' }, 'facet'],
  ['path', { d: 'M44 58 L76 58' }, 'eye'],
  ['circle', { cx: 60, cy: 58, r: 3.5 }, 'pupil'],
  ['path', { d: 'M60 72 L60 96' }, 'facet'],
];
const LEVIATHAN = [
  ['path', { d: 'M10 100 Q60 -24 110 100' }, 'main'],
  ['ellipse', { cx: 60, cy: 74, rx: 30, ry: 12 }, 'sub'],
  ['path', { d: 'M24 84 L8 92 M96 84 L112 92 M40 104 L36 116 M80 104 L84 116' }, 'facet'],
  ['circle', { cx: 60, cy: 48, r: 10 }, 'eye'],
  ['circle', { cx: 58, cy: 49, r: 4 }, 'pupil'],
];
const SHADE = [
  ['path', { d: 'M60 36 L60 6 M54 12 L60 6 L66 12' }, 'sub'],
  ['path', { d: 'M81 72 L107 87 M99 89 L107 87 L105 79' }, 'sub'],
  ['path', { d: 'M39 72 L13 87 M15 79 L13 87 L21 89' }, 'sub'],
  ['path', { d: 'M81 48 L104 30 M96 29 L104 30 L102 38' }, 'facet'],
  ['path', { d: 'M39 48 L16 30 M18 38 L16 30 L24 29' }, 'facet'],
  ['circle', { cx: 60, cy: 60, r: 24 }, 'main'],
  ['circle', { cx: 60, cy: 60, r: 10 }, 'eye'],
  ['circle', { cx: 61, cy: 61, r: 4 }, 'pupil'],
];
const KING = [
  ['path', { d: 'M28 34 L38 16 L50 30 L60 12 L70 30 L82 16 L92 34' }, 'sub'],
  ['rect', { x: 22, y: 46, width: 56, height: 56 }, 'main'],
  ['rect', { x: 42, y: 34, width: 56, height: 56 }, 'facet'],
  ['path', { d: 'M22 46 L42 34 M78 46 L98 34 M78 102 L98 90 M22 102 L42 90' }, 'facet'],
  ['circle', { cx: 50, cy: 74, r: 10 }, 'eye'],
  ['circle', { cx: 51, cy: 75, r: 4 }, 'pupil'],
];

export const BOSSES = [
  { name: 'The Limit Warden', shapes: W },
  { name: 'The Recoil Sentinel', shapes: SENTINEL },
  { name: 'The Orbit Knight', shapes: KNIGHT },
  { name: 'The Conic Leviathan', shapes: LEVIATHAN },
  { name: 'The Vector Shade', shapes: SHADE },
  { name: 'The Lattice King', shapes: KING },
];

export function bossFor(n) {
  return BOSSES[((n - 13) % BOSSES.length + BOSSES.length) % BOSSES.length];
}

// Each piece flies a different way when the boss shatters.
const SHARD = [[-30, -40, -40], [36, -30, 35], [-42, 20, 60], [40, 36, -55], [0, -50, 20], [-20, 46, -30], [26, 10, 80], [-8, 30, 45]];

export function BossArt({ n, class: cls = '' }) {
  const b = bossFor(n);
  return (
    <svg class={`boss-art ${cls}`} viewBox="0 0 120 120" aria-hidden="true">
      {b.shapes.map(([Tag, attrs, role], i) => {
        const [dx, dy, rot] = SHARD[i % SHARD.length];
        return (
          <g key={i} style={`--dx:${dx}px;--dy:${dy}px;--rot:${rot}deg;--i:${i}`}>
            <Tag {...attrs} class={`b-${role}`} />
          </g>
        );
      })}
    </svg>
  );
}
