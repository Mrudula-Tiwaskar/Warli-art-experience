/* ---------- Screen 5: TRACE (Faint Dotted Guides, 20px Magnetic Snap, & Reveal) ---------- */

import { STAMP_DEFS, sampleLinePoints, sampleCirclePoints } from "../stamps.js";
import { dist } from "../recognise.js";

export class TraceScreen {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.guidePoints = [];         // Array of { x, y, covered: boolean }
    this.tracedStrokes = [];       // Array of arrays of { x, y }
    this.currentTraceStroke = null;
    this.coveragePercent = 0;
    this.isRevealing = false;
    this.revealStartTime = 0;
    this.revealDurationMs = 700;
  }

  enter() {
    this.tracedStrokes = [];
    this.currentTraceStroke = null;
    this.coveragePercent = 0;
    this.isRevealing = false;

    // Build guide points from design stamps & freehand drawn shapes
    this.guidePoints = [];
    (this.app.designStamps || []).forEach((st) => {
      if (st.isFreehand) {
        if (st.type === "line") {
          const pts = sampleLinePoints(st.a.x, st.a.y, st.b.x, st.b.y, 8);
          pts.forEach((p) => this.guidePoints.push({ x: p.x, y: p.y, covered: false }));
        } else if (st.type === "circle") {
          const pts = sampleCirclePoints(st.cx, st.cy, st.r, 8);
          pts.forEach((p) => this.guidePoints.push({ x: p.x, y: p.y, covered: false }));
        } else if (st.type === "poly" && st.pts) {
          for (let i = 0; i < st.pts.length; i++) {
            const p1 = st.pts[i], p2 = st.pts[(i + 1) % st.pts.length];
            const pts = sampleLinePoints(p1.x, p1.y, p2.x, p2.y, 8);
            pts.forEach((p) => this.guidePoints.push({ x: p.x, y: p.y, covered: false }));
          }
        } else if (st.pts) {
          for (let i = 0; i < st.pts.length - 1; i++) {
            const pts = sampleLinePoints(st.pts[i].x, st.pts[i].y, st.pts[i + 1].x, st.pts[i + 1].y, 10);
            pts.forEach((p) => this.guidePoints.push({ x: p.x, y: p.y, covered: false }));
          }
        }
      } else {
        const def = STAMP_DEFS[st.stampType];
        if (def && def.getGuidePoints) {
          const pts = def.getGuidePoints(st.x, st.y, st.scale);
          pts.forEach((p) => {
            this.guidePoints.push({ x: p.x, y: p.y, covered: false });
          });
        }
      }
    });

    this.container = document.createElement("div");
    this.container.id = "screen-trace";
    this.container.className = "screen-overlay active hud-layer";

    this.container.innerHTML = `
      <div class="trace-header">
        <div class="trace-info">
          <h2>Trace Your Warli Motif</h2>
          <p class="trace-sub">Trace over the faint guidelines with a pinch. Lines magnetically snap for clean strokes.</p>
        </div>
        <div class="trace-progress-wrap">
          <div class="trace-progress-bar">
            <div class="trace-progress-fill" id="traceProgressFill" style="width: 0%;"></div>
          </div>
          <span class="trace-progress-text" id="traceProgressText">0% Completed</span>
        </div>
        <button id="traceFinishBtn" class="btn primary">Finish Now ➔</button>
      </div>
    `;

    document.getElementById("screen-container").appendChild(this.container);

    const finishBtn = this.container.querySelector("#traceFinishBtn");
    finishBtn.addEventListener("click", () => this.triggerRevealAndFinish());
    this.app.registerInteractiveTarget("traceFinishBtn", () => this.triggerRevealAndFinish(), finishBtn);
  }

  // 20px Magnetic Snap & Guide Point Covering
  processPinchPoint(rawPt) {
    if (this.isRevealing) return;

    let closestPt = null;
    let minD = 20.0; // 20px magnetic snap radius

    for (const gp of this.guidePoints) {
      const d = dist(rawPt, gp);
      if (d <= minD) {
        minD = d;
        closestPt = gp;
      }
    }

    // Magnetise coordinates if within range
    const snappedPt = closestPt
      ? { x: closestPt.x, y: closestPt.y }
      : { x: rawPt.x, y: rawPt.y };

    // Mark all nearby guide points as covered
    let newlyCovered = false;
    for (const gp of this.guidePoints) {
      if (!gp.covered && dist(snappedPt, gp) <= 22.0) {
        gp.covered = true;
        newlyCovered = true;
      }
    }

    // Add to current active stroke
    if (!this.currentTraceStroke) {
      this.currentTraceStroke = [snappedPt];
    } else {
      const last = this.currentTraceStroke[this.currentTraceStroke.length - 1];
      if (dist(last, snappedPt) >= 3.0) {
        this.currentTraceStroke.push(snappedPt);
      }
    }

    if (newlyCovered) {
      this.updateProgress();
    }
  }

  endPinchStroke() {
    if (this.currentTraceStroke && this.currentTraceStroke.length > 1) {
      this.tracedStrokes.push(this.currentTraceStroke);
    }
    this.currentTraceStroke = null;
  }

  // Erase traced lines and uncover guidelines within radius
  eraseAt(pt, radius = 32) {
    if (this.isRevealing) return;
    let modified = false;

    // Remove points from traced strokes
    for (let sIdx = this.tracedStrokes.length - 1; sIdx >= 0; sIdx--) {
      const stroke = this.tracedStrokes[sIdx];
      const remaining = stroke.filter((p) => dist(p, pt) > radius);
      if (remaining.length !== stroke.length) {
        modified = true;
        if (remaining.length < 2) {
          this.tracedStrokes.splice(sIdx, 1);
        } else {
          this.tracedStrokes[sIdx] = remaining;
        }
      }
    }

    // Uncover nearby guide points
    for (const gp of this.guidePoints) {
      if (gp.covered && dist(gp, pt) <= radius) {
        gp.covered = false;
        modified = true;
      }
    }

    if (modified) {
      this.updateProgress();
    }
  }

  updateProgress() {
    if (this.guidePoints.length === 0) return;
    const coveredCount = this.guidePoints.filter((g) => g.covered).length;
    this.coveragePercent = Math.min(100, Math.round((coveredCount / this.guidePoints.length) * 100));

    const fillEl = this.container.querySelector("#traceProgressFill");
    const textEl = this.container.querySelector("#traceProgressText");
    if (fillEl) fillEl.style.width = `${this.coveragePercent}%`;
    if (textEl) textEl.textContent = `${this.coveragePercent}% Completed`;

    // Auto-complete at >= 90%
    if (this.coveragePercent >= 90 && !this.isRevealing) {
      this.triggerRevealAndFinish();
    }
  }

  triggerRevealAndFinish() {
    if (this.isRevealing) return;
    this.isRevealing = true;
    this.revealStartTime = performance.now();

    // Mark 100%
    this.guidePoints.forEach((g) => { g.covered = true; });
    this.coveragePercent = 100;
    const fillEl = this.container.querySelector("#traceProgressFill");
    const textEl = this.container.querySelector("#traceProgressText");
    if (fillEl) fillEl.style.width = "100%";
    if (textEl) textEl.textContent = "100% Completed!";

    setTimeout(() => {
      this.app.goToScreen("RESULT");
    }, this.revealDurationMs);
  }

  exit() {
    this.app.unregisterInteractiveTarget("traceFinishBtn");
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  update(now) {
    const btn = this.container.querySelector("#traceFinishBtn");
    if (btn) this.app.checkDwellForElement("traceFinishBtn", btn, now);
  }

  render(ctx) {
    const paintColor = this.app.canvasRenderer.getPaintColor(this.app.currentCanvasType);

    // 1. Draw faint dotted guide outlines
    ctx.save();
    ctx.fillStyle = "rgba(251, 243, 228, 0.28)";
    ctx.strokeStyle = "rgba(251, 243, 228, 0.22)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 5]);

    // Faint preview of stamps & freehand motifs behind
    ctx.globalAlpha = 0.25;
    (this.app.designStamps || []).forEach((st) => {
      if (st.isFreehand) {
        this.app.drawItem(ctx, st, 0);
      } else {
        const def = STAMP_DEFS[st.stampType];
        if (def) def.draw(ctx, st.x, st.y, st.scale, paintColor);
      }
    });
    ctx.globalAlpha = 1.0;

    // Faint guide dots
    for (const gp of this.guidePoints) {
      if (!gp.covered) {
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 2. Draw user traced strokes in solid rice-paste paint with midpoint smoothing
    ctx.save();
    ctx.strokeStyle = paintColor;
    ctx.fillStyle = paintColor;
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(251, 243, 228, 0.4)";
    ctx.shadowBlur = 5;

    const allStrokes = [...this.tracedStrokes];
    if (this.currentTraceStroke) allStrokes.push(this.currentTraceStroke);

    allStrokes.forEach((stroke) => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 1; i++) {
        const mx = (stroke[i].x + stroke[i + 1].x) / 2;
        const my = (stroke[i].y + stroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, mx, my);
      }
      ctx.lineTo(stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
      ctx.stroke();
    });

    // 3. Reveal animation glow if finished
    if (this.isRevealing) {
      const elapsed = performance.now() - this.revealStartTime;
      const progress = Math.min(1.0, elapsed / this.revealDurationMs);
      ctx.globalAlpha = progress;
      (this.app.designStamps || []).forEach((st) => {
        if (st.isFreehand) {
          this.app.drawItem(ctx, st, 0);
        } else {
          const def = STAMP_DEFS[st.stampType];
          if (def) def.draw(ctx, st.x, st.y, st.scale, paintColor);
        }
      });
      ctx.globalAlpha = 1.0;
    }

    ctx.restore();
  }
}
