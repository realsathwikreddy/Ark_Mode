// Monsoon theme: a rainy city at night behind the app, and water drops sitting on the glass
// that magnify and bend whatever is underneath them (text, lines, cards).
import { useEffect, useRef, useState } from 'preact/hooks';

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- the city: drawn once into a canvas ----------
function drawCity(cv) {
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#060b18'); sky.addColorStop(0.55, '#0d1630'); sky.addColorStop(1, '#1a1430');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // glow from the street
  const glow = g.createRadialGradient(W * 0.5, H * 1.05, 10, W * 0.5, H * 1.05, H * 0.7);
  glow.addColorStop(0, 'rgba(255,140,80,.28)'); glow.addColorStop(1, 'rgba(255,140,80,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);

  const layers = [
    { base: H * 0.52, hMin: 60, hMax: 220, w: [26, 60], col: '#121a33', win: 0.10, blur: 3 },
    { base: H * 0.68, hMin: 80, hMax: 300, w: [34, 80], col: '#0d1328', win: 0.16, blur: 1.5 },
    { base: H * 0.86, hMin: 120, hMax: 380, w: [44, 96], col: '#080c1c', win: 0.22, blur: 0 },
  ];
  const winCols = ['#ffd38a', '#ffe7b0', '#9ad8ff', '#ff9ec7', '#c9f7ff'];
  layers.forEach((L) => {
    g.filter = L.blur ? `blur(${L.blur}px)` : 'none';
    let x = -20;
    while (x < W + 20) {
      const w = rnd(L.w[0], L.w[1]);
      const h = rnd(L.hMin, L.hMax);
      const top = L.base - h;
      g.fillStyle = L.col;
      g.fillRect(x, top, w, H - top);
      if (Math.random() < 0.25) g.fillRect(x + w * 0.4, top - rnd(8, 30), 2, 30); // antenna
      for (let wy = top + 8; wy < H; wy += 9) {
        for (let wx = x + 5; wx < x + w - 5; wx += 7) {
          if (Math.random() < L.win) {
            g.fillStyle = winCols[(Math.random() * winCols.length) | 0];
            g.globalAlpha = rnd(0.35, 0.9);
            g.fillRect(wx, wy, 3, 4);
            g.globalAlpha = 1;
          }
        }
      }
      x += w + rnd(2, 10);
    }
  });
  g.filter = 'none';
  // neon signs and car lights, blurred into bokeh
  for (let i = 0; i < 26; i++) {
    const bx = rnd(0, W), by = rnd(H * 0.45, H);
    const r = rnd(6, 26);
    const c = ['255,95,162', '127,216,255', '255,190,90', '170,140,255', '255,120,90'][(Math.random() * 5) | 0];
    const b = g.createRadialGradient(bx, by, 0, bx, by, r);
    b.addColorStop(0, `rgba(${c},${rnd(0.25, 0.55)})`); b.addColorStop(1, `rgba(${c},0)`);
    g.fillStyle = b; g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
  }
  // haze over everything so the UI stays readable
  const haze = g.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, 'rgba(6,10,22,.55)'); haze.addColorStop(0.5, 'rgba(6,10,22,.35)'); haze.addColorStop(1, 'rgba(6,10,22,.6)');
  g.fillStyle = haze; g.fillRect(0, 0, W, H);
}

// ---------- falling rain ----------
function startRain(cv) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  let W, H;
  const size = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
  size();
  const g = cv.getContext('2d');
  const drops = Array.from({ length: 140 }, () => ({ x: rnd(0, 1), y: rnd(0, 1), z: rnd(0.3, 1) }));
  const splashes = [];
  let raf = 0, last = performance.now();
  const frame = (t) => {
    const dt = Math.min(50, t - last) / 1000; last = t;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.lineCap = 'round';
    for (const d of drops) {
      const sp = 900 * d.z;
      d.y += (sp * dt) / H; d.x += (sp * 0.12 * dt) / W;
      if (d.y > 1.02) {
        if (d.z > 0.75 && splashes.length < 30) splashes.push({ x: d.x * W, y: H * rnd(0.8, 1), t: 0 });
        d.y = rnd(-0.2, 0); d.x = rnd(-0.1, 1);
      }
      const x = d.x * W, y = d.y * H, len = 14 + 22 * d.z;
      g.strokeStyle = `rgba(190,215,255,${0.08 + 0.22 * d.z})`;
      g.lineWidth = 0.6 + 0.9 * d.z;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - len * 0.12, y - len); g.stroke();
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]; s.t += dt * 3;
      if (s.t > 1) { splashes.splice(i, 1); continue; }
      g.strokeStyle = `rgba(190,215,255,${0.35 * (1 - s.t)})`; g.lineWidth = 0.8;
      g.beginPath(); g.ellipse(s.x, s.y, 2 + s.t * 9, 1 + s.t * 2.5, 0, Math.PI, 2 * Math.PI); g.stroke();
    }
    raf = requestAnimationFrame(frame);
  };
  if (reduced()) { frame(performance.now()); cancelAnimationFrame(raf); }
  else raf = requestAnimationFrame(frame);
  const onVis = () => { cancelAnimationFrame(raf); if (document.visibilityState === 'visible' && !reduced()) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);
  addEventListener('resize', size);
  return () => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVis); removeEventListener('resize', size); };
}

// ---------- drops on the glass ----------
function makeDrops(W, H, n = 7) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 400) {
    const rx = rnd(16, 44);
    const d = { id: Math.random().toString(36).slice(2), x: rnd(rx + 6, W - rx - 6), y: rnd(150, H - 120), rx, ry: rx * rnd(1.05, 1.3), shape: blob() };
    if (out.every((o) => Math.hypot(o.x - d.x, o.y - d.y) > o.rx + d.rx + 18)) out.push(d);
  }
  return out;
}
const blob = () => `${rnd(44, 56)}% ${rnd(44, 56)}% ${rnd(44, 56)}% ${rnd(44, 56)}% / ${rnd(48, 58)}% ${rnd(48, 58)}% ${rnd(42, 52)}% ${rnd(42, 52)}%`;

// Displacement map: inside each drop, pixels are pulled from closer to the centre (magnified),
// strongest in the middle and fading to nothing at the rim, so straight lines bow outward.
const SCALE = 90;
function lensMap(drops, W, H) {
  const k = 0.5; // map resolution
  const w = Math.ceil(W * k), h = Math.ceil(H * k);
  const cv = lensMap.cv || (lensMap.cv = document.createElement('canvas'));
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const a = img.data;
  for (let i = 0; i < a.length; i += 4) { a[i] = 128; a[i + 1] = 128; a[i + 2] = 128; a[i + 3] = 255; }
  for (const d of drops) {
    const x0 = Math.max(0, Math.floor((d.x - d.rx) * k)), x1 = Math.min(w - 1, Math.ceil((d.x + d.rx) * k));
    const y0 = Math.max(0, Math.floor((d.y - d.ry) * k)), y1 = Math.min(h - 1, Math.ceil((d.y + d.ry) * k));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const vx = px / k - d.x, vy = py / k - d.y;
        const nx = vx / d.rx, ny = vy / d.ry;
        const r2 = nx * nx + ny * ny;
        if (r2 >= 1) continue;
        const pull = 0.55 * (1 - r2) * (1 - r2 * 0.35);
        // a drop sits heavier at the bottom: pull a little downward too
        const dx = -vx * pull;
        const dy = -vy * pull + d.ry * 0.12 * (1 - r2);
        const i = (py * w + px) * 4;
        a[i] = Math.max(0, Math.min(255, 128 + (dx / SCALE) * 255));
        a[i + 1] = Math.max(0, Math.min(255, 128 + (dy / SCALE) * 255));
      }
    }
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

export function Rain({ lens = true, screen }) {
  const city = useRef(null);
  const rain = useRef(null);
  const [size, setSize] = useState({ W: innerWidth, H: innerHeight });
  const [drops, setDrops] = useState(() => makeDrops(innerWidth, innerHeight));
  const [map, setMap] = useState('');

  useEffect(() => {
    drawCity(city.current);
    const stop = startRain(rain.current);
    const onR = () => { setSize({ W: innerWidth, H: innerHeight }); drawCity(city.current); };
    addEventListener('resize', onR);
    return () => { stop(); removeEventListener('resize', onR); };
  }, []);

  // New screen, new rain on the glass.
  useEffect(() => { setDrops(makeDrops(size.W, size.H)); }, [screen, size.W, size.H]);

  useEffect(() => { if (lens) setMap(lensMap(drops, size.W, size.H)); }, [drops, lens, size.W, size.H]);

  // Every so often a drop gets heavy and slides down the glass.
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const iv = setInterval(() => {
      setDrops((ds) => {
        if (!ds.length) return ds;
        const pick = ds[(Math.random() * ds.length) | 0];
        const start = performance.now();
        const y0 = pick.y;
        let lastMap = 0;
        const step = (t) => {
          const p = Math.min(1, (t - start) / 1600);
          const e = p * p;
          setDrops((cur) => cur.map((d) => (d.id === pick.id ? { ...d, y: y0 + e * 260, ry: d.rx * (1.2 + e * 0.5) } : d)));
          if (p < 1) raf = requestAnimationFrame(step);
          else setDrops((cur) => [...cur.filter((d) => d.id !== pick.id), ...makeDrops(size.W, size.H, 1)]);
        };
        raf = requestAnimationFrame(step);
        return ds;
      });
    }, 9000);
    return () => { clearInterval(iv); cancelAnimationFrame(raf); };
  }, [size.W, size.H]);

  return (
    <>
      <canvas ref={city} class="rain-city" aria-hidden="true" />
      <canvas ref={rain} class="rain-fall" aria-hidden="true" />
      {lens && map && (
        <svg class="lens-defs" width="0" height="0" aria-hidden="true">
          <filter id="ark-lens" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width={size.W} height={size.H} color-interpolation-filters="sRGB">
            <feImage href={map} x="0" y="0" width={size.W} height={size.H} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={SCALE} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <div class="glass-drops" aria-hidden="true">
        {drops.map((d) => (
          <i key={d.id} class="gdrop" style={`left:${d.x - d.rx}px;top:${d.y - d.ry}px;width:${d.rx * 2}px;height:${d.ry * 2}px;border-radius:${d.shape}`} />
        ))}
      </div>
    </>
  );
}
