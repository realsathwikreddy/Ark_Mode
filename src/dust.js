// Turn an element into drifting dust. It redraws the element (background, border,
// text, tick box) onto a canvas, then breaks every few pixels off as a particle,
// sweeping left to right so it looks like it's being blown away.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function paint(ctx, el, ox, oy) {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const x = r.left - ox, y = r.top - oy;
  const rad = parseFloat(cs.borderTopLeftRadius) || 0;
  const bg = cs.backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    ctx.fillStyle = bg; roundRect(ctx, x, y, r.width, r.height, rad); ctx.fill();
  }
  const bw = parseFloat(cs.borderTopWidth) || 0;
  if (bw > 0 && cs.borderTopStyle !== 'none') {
    ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = bw;
    roundRect(ctx, x + bw / 2, y + bw / 2, r.width - bw, r.height - bw, rad); ctx.stroke();
  }
  // text nodes directly inside this element
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && n.textContent.trim()) {
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()];
      ctx.fillStyle = cs.color;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.textBaseline = 'middle';
      // one rect per line; split the text roughly across lines
      const words = n.textContent.trim().split(/\s+/);
      let wi = 0;
      rects.forEach((rc, li) => {
        let line = '';
        while (wi < words.length) {
          const test = line ? `${line} ${words[wi]}` : words[wi];
          if (ctx.measureText(test).width > rc.width + 2 && line) break;
          line = test; wi++;
          if (li === rects.length - 1) continue;
        }
        if (li === rects.length - 1 && wi < words.length) line += ' ' + words.slice(wi).join(' ');
        ctx.fillText(line, rc.left - ox, rc.top - oy + rc.height / 2);
      });
    } else if (n.nodeType === 1) {
      const ccs = getComputedStyle(n);
      if (ccs.display !== 'none' && ccs.visibility !== 'hidden' && n.tagName.toLowerCase() !== 'svg') paint(ctx, n, ox, oy);
      else if (n.tagName.toLowerCase() === 'svg') {
        const sr = n.getBoundingClientRect();
        ctx.strokeStyle = ccs.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sr.left - ox + sr.width * .2, sr.top - oy + sr.height * .55);
        ctx.lineTo(sr.left - ox + sr.width * .42, sr.top - oy + sr.height * .75); ctx.lineTo(sr.left - ox + sr.width * .8, sr.top - oy + sr.height * .3); ctx.stroke();
      }
    }
  }
}

export function disintegrate(el, { duration = 1500, step = 2 } = {}) {
  if (!el || reduced()) return Promise.resolve();
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return Promise.resolve();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const padX = 160, padY = 120;
  const W = r.width + padX, H = r.height + padY;

  // 1. snapshot
  const snap = document.createElement('canvas');
  snap.width = r.width * dpr; snap.height = r.height * dpr;
  const sctx = snap.getContext('2d');
  sctx.scale(dpr, dpr);
  paint(sctx, el, r.left, r.top);
  const data = sctx.getImageData(0, 0, snap.width, snap.height).data;

  // 2. particles, tinted toward the theme accent so they glow
  const acc = (getComputedStyle(document.documentElement).getPropertyValue('--cy-rgb') || '79,240,255').split(',').map((v) => parseInt(v, 10));
  const parts = [];
  for (let y = 0; y < r.height; y += step) {
    for (let x = 0; x < r.width; x += step) {
      const i = ((Math.floor(y * dpr) * snap.width) + Math.floor(x * dpr)) * 4;
      const a = data[i + 3];
      if (a < 40) continue;
      const sweep = x / r.width;
      parts.push({
        x, y: y + padY, c: `rgba(${Math.round(data[i] * 0.55 + acc[0] * 0.45)},${Math.round(data[i + 1] * 0.55 + acc[1] * 0.45)},${Math.round(data[i + 2] * 0.55 + acc[2] * 0.45)},${Math.min(1, a / 255 + 0.15)})`,
        d: sweep * 0.45 + Math.random() * 0.2,
        vx: 30 + Math.random() * 90, vy: -20 - Math.random() * 70,
        sw: (Math.random() - 0.5) * 40, s: step,
      });
    }
  }

  // 3. animate on an overlay canvas
  const cv = document.createElement('canvas');
  cv.className = 'fx-dust';
  cv.width = W * dpr; cv.height = H * dpr;
  Object.assign(cv.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top - padY}px`, width: `${W}px`, height: `${H}px`, pointerEvents: 'none', zIndex: 59 });
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  el.style.visibility = 'hidden';

  return new Promise((resolve) => {
    const t0 = performance.now();
    const frame = (t) => {
      const p = (t - t0) / duration;
      ctx.clearRect(0, 0, W, H);
      for (const q of parts) {
        const lt = Math.max(0, (p - q.d) / (1 - q.d));
        if (lt <= 0) { ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.s, q.s); continue; }
        if (lt >= 1) continue;
        const e = lt * lt;
        const x = q.x + q.vx * e * 1.6 + Math.sin(lt * 6 + q.sw) * 4;
        const y = q.y + q.vy * e * 1.6;
        ctx.globalAlpha = 1 - lt;
        ctx.fillStyle = q.c;
        const sz = q.s * (1 - lt * 0.6);
        ctx.fillRect(x, y, sz, sz);
        ctx.globalAlpha = 1;
      }
      if (p < 1.05) requestAnimationFrame(frame);
      else { cv.remove(); resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

// Animate a number from its old value to a new one.
export function countTo(el, from, to, { duration = 650, fmt = (v) => v.toFixed(1) } = {}) {
  if (!el) return;
  if (reduced() || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Scramble digits before landing on the final value.
export function scramble(el, finalText, duration = 700) {
  if (!el) return;
  if (reduced()) { el.textContent = finalText; return; }
  const t0 = performance.now();
  const tick = (t) => {
    const p = (t - t0) / duration;
    if (p >= 1) { el.textContent = finalText; return; }
    el.textContent = finalText.split('').map((ch, i) => (p > (i + 1) / (finalText.length + 1) ? ch : String(Math.floor(Math.random() * 10)))).join('');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
