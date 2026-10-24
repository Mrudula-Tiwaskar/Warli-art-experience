import test from "node:test";
import assert from "node:assert/strict";
import {
  recognise,
  snapLine,
  chaikinSmooth,
  dist,
  pathLength
} from "../js/recognise.js";

test("recognises a circle when closed and round", () => {
  const pts = [];
  const cx = 100, cy = 100, r = 40;
  for (let i = 0; i <= 36; i++) {
    const th = (i / 36) * Math.PI * 2;
    // slight noise to simulate hand wobble
    const noise = (Math.sin(i * 3) * 1.5);
    pts.push({ x: cx + (r + noise) * Math.cos(th), y: cy + (r + noise) * Math.sin(th) });
  }

  const shape = recognise(pts);
  assert.ok(shape, "Shape should be detected");
  assert.equal(shape.type, "circle");
  assert.ok(Math.abs(shape.cx - cx) < 5);
  assert.ok(Math.abs(shape.cy - cy) < 5);
  assert.ok(Math.abs(shape.r - r) < 5);
});

test("recognises a triangle when closed with 3 distinct corners", () => {
  const corners = [
    { x: 100, y: 50 },
    { x: 150, y: 150 },
    { x: 50, y: 150 }
  ];
  const pts = [];
  for (let c = 0; c < 3; c++) {
    const a = corners[c];
    const b = corners[(c + 1) % 3];
    for (let t = 0; t <= 10; t++) {
      const frac = t / 10;
      pts.push({ x: a.x + frac * (b.x - a.x), y: a.y + frac * (b.y - a.y) });
    }
  }

  const shape = recognise(pts);
  assert.ok(shape, "Shape should be detected");
  assert.equal(shape.type, "poly");
  assert.equal(shape.pts.length, 3);
});

test("recognises straight line and snaps near-horizontal line within 8 degrees", () => {
  // Line with angle ~4 degrees (dx=100, dy=7 -> atan2(7,100) = 4.0 deg)
  const a = { x: 50, y: 100 };
  const b = { x: 150, y: 107 };
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    pts.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
  }

  const shape = recognise(pts);
  assert.ok(shape, "Line should be detected");
  assert.equal(shape.type, "line");
  // Check horizontal snap: a.y must equal b.y
  assert.equal(shape.a.y, shape.b.y, "Near-horizontal line should snap to flat horizontal");
});

test("snaps near-vertical line within 8 degrees", () => {
  // Line with angle ~86 degrees (dx=7, dy=100 -> deviation from vertical is ~4 deg)
  const a = { x: 100, y: 50 };
  const b = { x: 107, y: 150 };

  const snapped = snapLine(a, b, 8);
  assert.equal(snapped.snapped, "vertical");
  assert.equal(snapped.a.x, snapped.b.x, "Near-vertical line should snap to vertical");
});

test("chaikin smoothing reduces path roughness while preserving endpoints", () => {
  const rough = [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 20, y: -10 },
    { x: 30, y: 20 },
    { x: 40, y: 0 }
  ];

  const smoothed = chaikinSmooth(rough, 2, false);
  assert.equal(smoothed[0].x, rough[0].x);
  assert.equal(smoothed[0].y, rough[0].y);
  assert.equal(smoothed[smoothed.length - 1].x, rough[rough.length - 1].x);
  assert.equal(smoothed[smoothed.length - 1].y, rough[rough.length - 1].y);
  assert.ok(smoothed.length > rough.length);
});

test("automatically straightens a shaky hand-drawn line", () => {
  const pts = [];
  for (let x = 50; x <= 250; x += 5) {
    // Hand jitter up to 6px off the straight path
    const jitter = Math.sin(x * 0.3) * 5;
    pts.push({ x, y: 150 + jitter });
  }
  const shape = recognise(pts);
  assert.ok(shape, "Shape should be detected");
  assert.equal(shape.type, "line");
  assert.equal(shape.a.y, shape.b.y, "Wobbly line should snap into a straight horizontal line");
});
