// Title frames: cosmetic rings drawn around your level number. Bought with gold in the store.
export const FRAMES = [
  { id: 'hex', name: 'Hex Frame', cost: 40, desc: 'A sharp hexagon around your level.' },
  { id: 'orbit', name: 'Orbit Ring', cost: 60, desc: 'Two rings that slowly orbit your level.' },
  { id: 'circuit', name: 'Circuit', cost: 90, desc: 'Traces that pulse with light.' },
  { id: 'crown', name: 'Crown Line', cost: 140, desc: 'A thin crown above your level.' },
  { id: 'flare', name: 'Solar Flare', cost: 220, desc: 'A burning ring with sparks. Flex.' },
];

export function Frame({ id }) {
  if (!id) return null;
  return (
    <svg class={`frame frame-${id}`} viewBox="0 0 100 100" aria-hidden="true">
      {id === 'hex' && <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" />}
      {id === 'orbit' && (
        <>
          <ellipse class="spin" cx="50" cy="50" rx="46" ry="20" />
          <ellipse class="spin rev" cx="50" cy="50" rx="46" ry="20" transform="rotate(60 50 50)" />
          <circle class="spin" cx="96" cy="50" r="3" />
        </>
      )}
      {id === 'circuit' && (
        <>
          <rect x="8" y="8" width="84" height="84" rx="6" />
          <path class="trace" d="M8 30 H-2 M92 70 H102 M30 8 V-2 M70 92 V102 M8 70 H0 V82 M92 30 H100 V18" />
          <circle cx="8" cy="30" r="2.5" /><circle cx="92" cy="70" r="2.5" /><circle cx="30" cy="8" r="2.5" /><circle cx="70" cy="92" r="2.5" />
        </>
      )}
      {id === 'crown' && (
        <>
          <circle cx="50" cy="54" r="42" />
          <path d="M26 16 L34 2 L42 12 L50 -2 L58 12 L66 2 L74 16" />
        </>
      )}
      {id === 'flare' && (
        <>
          <circle class="flare-ring" cx="50" cy="50" r="44" />
          <circle class="spin" cx="50" cy="50" r="48" stroke-dasharray="3 9" />
          <circle class="spin rev" cx="50" cy="50" r="40" stroke-dasharray="1 7" />
        </>
      )}
    </svg>
  );
}
