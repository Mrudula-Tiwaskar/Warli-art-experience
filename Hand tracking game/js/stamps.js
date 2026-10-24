/* ---------- Warli Stamps: SVG Loader, Tinted Rendering & Path Guide Points ---------- */
//
// Key design decisions:
//  1. SVGs are fetched as text then turned into blob-URLs so MIME type issues
//     on the dev server cannot block loading.
//  2. Each SVG is also parsed with DOMParser so we can walk its <path> elements
//     with getTotalLength / getPointAtLength → trace dots follow the real contours.
//  3. Rendering uses a regular HTMLCanvasElement (not OffscreenCanvas) for
//     maximum browser compat, with source-atop compositing to tint white art
//     to the current paint colour.

// ---------------------------------------------------------------------------
// Guide-point helpers (exported – used by trace.js)
// ---------------------------------------------------------------------------

export function sampleLinePoints(x1, y1, x2, y2, step = 8) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const count = Math.max(2, Math.ceil(d / step));
  const pts = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    pts.push({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) });
  }
  return pts;
}

export function sampleCirclePoints(cx, cy, r, step = 8) {
  const circumference = 2 * Math.PI * r;
  const count = Math.max(8, Math.ceil(circumference / step));
  const pts = [];
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    pts.push({ x: cx + r * Math.cos(th), y: cy + r * Math.sin(th) });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// SVG asset registry
// ---------------------------------------------------------------------------

const BASE = './assets/';

// Per-SVG metadata: viewBox dimensions used to map SVG coords → screen coords
const SVG_META = {
  man:          { path: BASE + 'Man.svg',          vbW: 664,  vbH: 880  },
  woman:        { path: BASE + 'Woman.svg',        vbW: 664,  vbH: 880  },
  deer:         { path: BASE + 'Deer warli.svg',   vbW: 880,  vbH: 664  },
  hut:          { path: BASE + 'Hut warli.svg',    vbW: 346,  vbH: 274  },
  tarpa_circle: { path: BASE + 'Tarpa circle.svg', vbW: 500,  vbH: 500  },
  tarpa_player: { path: BASE + 'Tarpa player.svg', vbW: 883,  vbH: 894  },
  tree:         { path: BASE + 'Tree.svg',         vbW: 400,  vbH: 560  },
};

// Runtime cache per stamp id:
//   { img: HTMLImageElement, guideNorm: [{nx, ny}], state: 'ok'|'pending'|'error' }
const _cache = {};

// A tiny shared SVG element in the DOM used for SVGPathElement geometry calls
let _svgHost = null;
function getSVGHost() {
  if (!_svgHost) {
    _svgHost = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _svgHost.style.cssText = 'position:fixed;width:0;height:0;opacity:0;pointer-events:none';
    document.body.appendChild(_svgHost);
  }
  return _svgHost;
}

/**
 * Sample all <path> elements from a parsed SVG document.
 * Returns normalised points (0..1) in the SVG's own viewBox space.
 */
function extractNormalisedPathPoints(svgDoc, vbW, vbH, sampleStep = 12) {
  const host = getSVGHost();
  const normPts = [];

  const paths = svgDoc.querySelectorAll('path');
  paths.forEach((origPath) => {
    // Clone into the live SVG host so geometry methods are available
    const p = host.appendChild(
      document.createElementNS('http://www.w3.org/2000/svg', 'path')
    );
    p.setAttribute('d', origPath.getAttribute('d') || '');

    try {
      const total = p.getTotalLength();
      if (!total || !isFinite(total)) return;
      const steps = Math.max(6, Math.ceil(total / sampleStep));
      for (let i = 0; i <= steps; i++) {
        const pt = p.getPointAtLength((i / steps) * total);
        normPts.push({ nx: pt.x / vbW, ny: pt.y / vbH });
      }
    } catch (_) {
      // getTotalLength not supported for this path shape; skip
    } finally {
      host.removeChild(p);
    }
  });

  return normPts;
}

/**
 * Scale normalised path points to screen coords centred on (x, y).
 */
function normToScreen(normPts, x, y, displayW, displayH) {
  return normPts.map((np) => ({
    x: x - displayW / 2 + np.nx * displayW,
    y: y - displayH / 2 + np.ny * displayH,
  }));
}

/**
 * Load an SVG: fetch as text → blob URL for the <img>, and DOMParser for paths.
 * Populates _cache[id] when done.
 */
async function loadSVGStamp(id) {
  const meta = SVG_META[id];
  if (!meta) return;

  _cache[id] = { state: 'pending', img: null, guideNorm: [] };

  try {
    const res = await fetch(meta.path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();

    // 1. Parse for path guide points
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');

    // Detect actual viewBox from the document (overrides our estimate if present)
    const vbAttr = doc.documentElement.getAttribute('viewBox');
    let vbW = meta.vbW, vbH = meta.vbH;
    if (vbAttr) {
      const parts = vbAttr.trim().split(/[\s,]+/).map(Number);
      if (parts.length >= 4) { vbW = parts[2]; vbH = parts[3]; }
    }

    const guideNorm = extractNormalisedPathPoints(doc, vbW, vbH, 14);

    // 2. Create a blob URL for the HTMLImageElement
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    _cache[id] = { state: 'ok', img, guideNorm };
  } catch (err) {
    console.warn(`[stamps] Failed to load ${id}:`, err);
    _cache[id] = { state: 'error', img: null, guideNorm: [] };
  }
}

// Kick-off loading for all SVG stamps immediately on module import
for (const id of Object.keys(SVG_META)) {
  loadSVGStamp(id);
}

/** Public accessor for the stamp image cache (used by design.js for thumbnails) */
export function getStampCache(id) {
  return _cache[id] || null;
}

// ---------------------------------------------------------------------------
// Rendering helper
// ---------------------------------------------------------------------------

// Reusable offscreen canvas for tinting (1 instance, resized on demand)
let _tintCanvas = null;
let _tintCtx = null;

function getTintCanvas(w, h) {
  if (!_tintCanvas) {
    _tintCanvas = document.createElement('canvas');
    _tintCtx = _tintCanvas.getContext('2d');
  }
  if (_tintCanvas.width !== w)  _tintCanvas.width  = w;
  if (_tintCanvas.height !== h) _tintCanvas.height = h;
  return { canvas: _tintCanvas, ctx: _tintCtx };
}

/**
 * Draw a tinted SVG stamp centred on (x, y).
 * The SVGs are white-on-transparent; source-atop maps white → paintColor.
 */
function drawSVGStamp(ctx, id, x, y, drawW, drawH, color, alpha = 1) {
  const entry = _cache[id];

  if (!entry || entry.state !== 'ok' || !entry.img) {
    // Show a subtle loading placeholder (fades away once loaded)
    ctx.save();
    ctx.globalAlpha = alpha * 0.3;
    ctx.strokeStyle = color || '#fbf3e4';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x - drawW / 2, y - drawH / 2, drawW, drawH);
    ctx.setLineDash([]);
    ctx.font = `${Math.round(drawH * 0.18)}px sans-serif`;
    ctx.fillStyle = color || '#fbf3e4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⟳', x, y);
    ctx.restore();
    return;
  }

  const w = Math.max(1, Math.ceil(drawW));
  const h = Math.max(1, Math.ceil(drawH));

  const { canvas: tc, ctx: tg } = getTintCanvas(w, h);
  tg.clearRect(0, 0, w, h);
  tg.drawImage(entry.img, 0, 0, w, h);

  // Tint: fill the drawn pixels with the paint colour
  tg.globalCompositeOperation = 'source-atop';
  tg.fillStyle = color || '#fbf3e4';
  tg.fillRect(0, 0, w, h);
  tg.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(tc, x - w / 2, y - h / 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Procedural mini-helpers (retained for built-in stamps: sun, bird, peacock)
// ---------------------------------------------------------------------------

function _tri(ctx, x1, y1, x2, y2, x3, y3, fill = true) {
  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3);
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}
function _line(ctx, x1, y1, x2, y2) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

// ---------------------------------------------------------------------------
// STAMP_DEFS — consumed by design.js, trace.js, result.js
// ---------------------------------------------------------------------------

export const STAMP_DEFS = {

  // ── SVG-based Warli motifs ────────────────────────────────────────────

  man: {
    id: 'man', name: 'Warli Man',
    svgPath: SVG_META.man.path,
    baseW: 55, baseH: 73, width: 55, height: 73,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'man', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['man'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      return _bboxGrid(x, y, this.baseW, this.baseH, scale);
    },
  },

  woman: {
    id: 'woman', name: 'Warli Woman',
    svgPath: SVG_META.woman.path,
    baseW: 55, baseH: 73, width: 55, height: 73,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'woman', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['woman'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      return _bboxGrid(x, y, this.baseW, this.baseH, scale);
    },
  },

  deer: {
    id: 'deer', name: 'Warli Deer',
    svgPath: SVG_META.deer.path,
    baseW: 84, baseH: 63, width: 84, height: 63,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'deer', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['deer'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      return _bboxGrid(x, y, this.baseW, this.baseH, scale);
    },
  },

  hut: {
    id: 'hut', name: 'Warli Hut',
    svgPath: SVG_META.hut.path,
    baseW: 80, baseH: 63, width: 80, height: 63,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'hut', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['hut'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      return _bboxGrid(x, y, this.baseW, this.baseH, scale);
    },
  },

  tarpa_circle: {
    id: 'tarpa_circle', name: 'Tarpa Dance Ring',
    svgPath: SVG_META.tarpa_circle.path,
    baseW: 130, baseH: 130, width: 130, height: 130,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'tarpa_circle', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['tarpa_circle'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      const r = (this.baseW / 2) * scale;
      return [...sampleCirclePoints(x, y, r, 10), ...sampleCirclePoints(x, y, r * 0.55, 10)];
    },
  },

  tarpa_player: {
    id: 'tarpa_player', name: 'Tarpa Musician',
    svgPath: SVG_META.tarpa_player.path,
    baseW: 55, baseH: 55, width: 55, height: 55,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'tarpa_player', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['tarpa_player'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      return _bboxGrid(x, y, this.baseW, this.baseH, scale);
    },
  },

  tree: {
    id: 'tree', name: 'Sacred Tree',
    svgPath: SVG_META.tree.path,
    baseW: 64, baseH: 90, width: 64, height: 90,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      drawSVGStamp(ctx, 'tree', x, y, this.baseW * scale, this.baseH * scale, color);
    },
    getGuidePoints(x, y, scale = 1) {
      const entry = _cache['tree'];
      if (entry && entry.state === 'ok' && entry.guideNorm.length > 0) {
        return normToScreen(entry.guideNorm, x, y, this.baseW * scale, this.baseH * scale);
      }
      return _bboxGrid(x, y, this.baseW, this.baseH, scale);
    },
  },

  // ── Procedural built-ins ─────────────────────────────────────────────

  sun: {
    id: 'sun', name: 'Sun / Surya',
    width: 70, height: 70,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = color; ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, 2.4 * scale);
      const r = 16 * scale;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 16; i++) {
        const th = (i / 16) * Math.PI * 2;
        const len = (i % 2 === 0 ? 12 : 7) * scale;
        _line(ctx,
          (r + 2 * scale) * Math.cos(th), (r + 2 * scale) * Math.sin(th),
          (r + 2 * scale + len) * Math.cos(th), (r + 2 * scale + len) * Math.sin(th)
        );
      }
      ctx.restore();
    },
    getGuidePoints(x, y, scale = 1) {
      const r = 16 * scale;
      const pts = [...sampleCirclePoints(x, y, r, 8)];
      for (let i = 0; i < 16; i++) {
        const th = (i / 16) * Math.PI * 2;
        const len = (i % 2 === 0 ? 12 : 7) * scale;
        pts.push(...sampleLinePoints(
          x + (r + 2 * scale) * Math.cos(th), y + (r + 2 * scale) * Math.sin(th),
          x + (r + 2 * scale + len) * Math.cos(th), y + (r + 2 * scale + len) * Math.sin(th), 6
        ));
      }
      return pts;
    },
  },

  bird: {
    id: 'bird', name: 'Warli Bird',
    width: 60, height: 50,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = color; ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.8, 2.2 * scale);
      const u = 10 * scale;
      _tri(ctx, -1.2 * u, 0, 1.2 * u, -0.4 * u, 0, 0.8 * u, true);
      ctx.beginPath(); ctx.arc(1.5 * u, -0.8 * u, 0.45 * u, 0, Math.PI * 2); ctx.fill();
      _line(ctx, 1.9 * u, -0.8 * u, 2.5 * u, -0.6 * u);
      _tri(ctx, -0.2 * u, 0, 0.4 * u, -1.8 * u, -1.2 * u, -1.4 * u, true);
      _line(ctx, -1.2 * u, 0, -2.4 * u, -0.4 * u);
      _line(ctx, -1.2 * u, 0, -2.6 * u, 0.2 * u);
      ctx.restore();
    },
    getGuidePoints(x, y, scale = 1) {
      const u = 10 * scale;
      return [
        ...sampleLinePoints(x - 1.2 * u, y, x + 1.2 * u, y - 0.4 * u),
        ...sampleLinePoints(x + 1.2 * u, y - 0.4 * u, x, y + 0.8 * u),
        ...sampleLinePoints(x, y + 0.8 * u, x - 1.2 * u, y),
        ...sampleCirclePoints(x + 1.5 * u, y - 0.8 * u, 0.45 * u, 6),
        ...sampleLinePoints(x - 0.2 * u, y, x + 0.4 * u, y - 1.8 * u),
        ...sampleLinePoints(x + 0.4 * u, y - 1.8 * u, x - 1.2 * u, y - 1.4 * u),
      ];
    },
  },

  peacock: {
    id: 'peacock', name: 'Warli Peacock',
    width: 85, height: 75,
    draw(ctx, x, y, scale = 1, color = '#fbf3e4') {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = color; ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.8, 2.4 * scale);
      ctx.lineCap = 'round';
      const u = 11 * scale;
      _tri(ctx, 0, 0, 1.5 * u, 0.5 * u, 0.6 * u, 1.5 * u, true);
      _line(ctx, 1.3 * u, 0.3 * u, 2.0 * u, -1.2 * u);
      ctx.beginPath(); ctx.arc(2.0 * u, -1.5 * u, 0.4 * u, 0, Math.PI * 2); ctx.fill();
      _line(ctx, 2.0 * u, -1.9 * u, 1.8 * u, -2.5 * u);
      _line(ctx, 2.0 * u, -1.9 * u, 2.2 * u, -2.6 * u);
      _line(ctx, 2.0 * u, -1.9 * u, 2.5 * u, -2.4 * u);
      for (let i = 0; i < 6; i++) {
        const th = Math.PI * 0.75 + (i / 5) * (Math.PI * 0.65);
        const fx = 2.8 * u * Math.cos(th), fy = 2.8 * u * Math.sin(th);
        _line(ctx, 0, 0.4 * u, fx, fy);
        ctx.beginPath(); ctx.arc(fx, fy, 0.35 * u, 0, Math.PI * 2); ctx.fill();
      }
      _line(ctx, 0.5 * u, 1.4 * u, 0.3 * u, 2.5 * u);
      _line(ctx, 1.0 * u, 1.2 * u, 1.2 * u, 2.5 * u);
      ctx.restore();
    },
    getGuidePoints(x, y, scale = 1) {
      const u = 11 * scale;
      const pts = [
        ...sampleLinePoints(x, y, x + 1.5 * u, y + 0.5 * u),
        ...sampleLinePoints(x + 1.5 * u, y + 0.5 * u, x + 0.6 * u, y + 1.5 * u),
        ...sampleLinePoints(x + 0.6 * u, y + 1.5 * u, x, y),
        ...sampleLinePoints(x + 1.3 * u, y + 0.3 * u, x + 2.0 * u, y - 1.2 * u),
        ...sampleCirclePoints(x + 2.0 * u, y - 1.5 * u, 0.4 * u, 6),
      ];
      for (let i = 0; i < 6; i++) {
        const th = Math.PI * 0.75 + (i / 5) * (Math.PI * 0.65);
        const len = 2.8 * u;
        const fx = x + len * Math.cos(th), fy = y + 0.4 * u + len * Math.sin(th);
        pts.push(...sampleLinePoints(x, y + 0.4 * u, fx, fy, 8));
        pts.push(...sampleCirclePoints(fx, fy, 0.35 * u, 6));
      }
      return pts;
    },
  },
};

// ---------------------------------------------------------------------------
// Bounding-box fallback for guide points (used while SVG loads)
// ---------------------------------------------------------------------------

function _bboxGrid(x, y, bW, bH, scale, steps = 20) {
  const w = bW * scale, h = bH * scale;
  const L = x - w / 2, T = y - h / 2;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push({ x: L + t * w, y: T });
    pts.push({ x: L + t * w, y: T + h });
    pts.push({ x: L,         y: T + t * h });
    pts.push({ x: L + w,     y: T + t * h });
  }
  return pts;
}
