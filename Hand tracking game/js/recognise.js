/* ---------- Stroke recognition: wobbly stroke in, clean Warli shape out ---------- */

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function bbox(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Evenly spaced points along the path, so slow and fast parts of a stroke count equally.
export function resample(pts, n) {
  const total = pathLength(pts);
  if (total === 0) return pts.slice();
  const step = total / (n - 1);
  const out = [{ x: pts[0].x, y: pts[0].y }];
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i];
    let d = dist(prev, cur);
    while (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q = { x: prev.x + t * (cur.x - prev.x), y: prev.y + t * (cur.y - prev.y) };
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  const last = pts[pts.length - 1];
  while (out.length < n) out.push({ x: last.x, y: last.y });
  return out.slice(0, n);
}

export function perpDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return dist(p, a);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

// Ramer-Douglas-Peucker: keeps only the points that matter for the outline.
export function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], a, b);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [a, b];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

// Merge corners that are almost on top of each other (happens where you close the shape).
export function mergeClose(poly, minGap) {
  const pts = poly.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      if (dist(pts[i], pts[j]) < minGap) {
        pts[i] = { x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 };
        pts.splice(j, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

// Remove vertices that sit on an almost straight edge (e.g. where you started drawing).
export function dropStraight(poly, minAngleDeg) {
  const pts = poly.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const next = pts[(i + 1) % pts.length];
      const v1 = { x: prev.x - cur.x, y: prev.y - cur.y };
      const v2 = { x: next.x - cur.x, y: next.y - cur.y };
      const denom = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1;
      const cos = (v1.x * v2.x + v1.y * v2.y) / denom;
      const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      if (angle > minAngleDeg) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

// If the stroke comes back near its start, cut it at the closest return point.
// Hands overshoot when closing a shape; this removes the extra overlap.
export function trimLoop(raw) {
  const total = pathLength(raw);
  let acc = 0, bestI = raw.length - 1, bestD = Infinity;
  for (let i = 1; i < raw.length; i++) {
    acc += dist(raw[i - 1], raw[i]);
    if (acc < 0.5 * total) continue; // only look at the second half of the stroke
    const d = dist(raw[i], raw[0]);
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return { pts: raw.slice(0, bestI + 1), gap: bestD };
}

// Chaikin smoothing algorithm for organic, non-wavy curves
export function chaikinSmooth(pts, iterations = 2, closed = false) {
  if (pts.length < 3) return pts.slice();
  let curr = pts.slice();

  for (let it = 0; it < iterations; it++) {
    const smoothed = [];
    if (!closed) smoothed.push(curr[0]);

    const len = closed ? curr.length : curr.length - 1;
    for (let i = 0; i < len; i++) {
      const p0 = curr[i];
      const p1 = curr[(i + 1) % curr.length];
      const q = { x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y };
      const r = { x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y };
      smoothed.push(q);
      smoothed.push(r);
    }

    if (!closed) smoothed.push(curr[curr.length - 1]);
    curr = smoothed;
  }

  return curr;
}

// Snap near-horizontal or vertical line segments (within maxAngleDeg, default 8 degrees)
export function snapLine(a, b, maxAngleDeg = 8) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angleRad = Math.atan2(dy, dx);
  let deg = (angleRad * 180) / Math.PI; // -180 to 180

  // Near 0 or +/-180 (horizontal)
  const distFrom0 = Math.abs(deg);
  const distFrom180 = Math.abs(180 - Math.abs(deg));
  if (distFrom0 <= maxAngleDeg || distFrom180 <= maxAngleDeg) {
    const avgY = (a.y + b.y) / 2;
    return { a: { x: a.x, y: avgY }, b: { x: b.x, y: avgY }, snapped: "horizontal" };
  }

  // Near 90 or -90 (vertical)
  const distFrom90 = Math.abs(90 - Math.abs(deg));
  if (distFrom90 <= maxAngleDeg) {
    const avgX = (a.x + b.x) / 2;
    return { a: { x: avgX, y: a.y }, b: { x: avgX, y: b.y }, snapped: "vertical" };
  }

  return { a, b, snapped: false };
}

/*
  Returns one of:
    { type: "circle", cx, cy, r }     closed and round          -> Warli head
    { type: "poly",   pts: [...] }    closed, 3 or 4 corners    -> Warli triangle / diamond
    { type: "blob",   pts: [...] }    closed, anything else
    { type: "line",   a, b }          open and straight
    { type: "curve",  pts: [...] }    open and curved
  or null if the stroke is too small to count.
*/
export function recognise(raw) {
  if (!raw || raw.length < 5) return null;

  const bb = bbox(raw);
  const size = Math.max(bb.w, bb.h);
  if (size < 20) return null; // ignore accidental micro taps

  const loop = trimLoop(raw);
  const loopLen = pathLength(loop.pts);
  const endToStartDist = dist(raw[0], raw[raw.length - 1]);
  // Consider closed if end returned near start (accommodates finger drawing gap)
  const closed = loop.pts.length > 5 && (loop.gap < 0.32 * loopLen || endToStartDist < 0.35 * size);

  if (closed) {
    const ring = resample(loop.pts, 64);
    const perimeter = pathLength(ring) + dist(ring[0], ring[ring.length - 1]);
    const area = polygonArea(ring);
    const circularity = (4 * Math.PI * area) / (perimeter * perimeter); // circle = 1.0

    // Automatically snap to clean geometric circle if round (threshold tuned for finger gesture)
    if (circularity >= 0.68) {
      const cx = ring.reduce((s, p) => s + p.x, 0) / ring.length;
      const cy = ring.reduce((s, p) => s + p.y, 0) / ring.length;
      const r = ring.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / ring.length;
      return { type: "circle", cx, cy, r };
    }

    let corners = rdp(ring.concat([ring[0]]), 0.09 * size).slice(0, -1);
    corners = mergeClose(corners, 0.18 * size);
    corners = dropStraight(corners, 150);
    if (corners.length === 3 || corners.length === 4) {
      return { type: "poly", pts: corners };
    }
    return { type: "blob", pts: chaikinSmooth(ring, 3, true) };
  }

  const pts = resample(raw, 64);
  const L = pathLength(raw);
  const directLen = dist(pts[0], pts[pts.length - 1]);
  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, perpDist(p, pts[0], pts[pts.length - 1]));

  // Automatically straighten shaky finger lines
  if (maxDev < 0.16 * L || (directLen > 0.82 * L && maxDev < 0.22 * L)) {
    const snapped = snapLine(pts[0], pts[pts.length - 1], 10);
    return { type: "line", a: snapped.a, b: snapped.b };
  }

  // Organic curve with 3-pass smoothing to eliminate tremors
  return { type: "curve", pts: chaikinSmooth(resample(raw, 36), 3, false) };
}
