/* ---------- Screen 6: RESULT (Masterpiece Gallery & Clean PNG Export) ---------- */

import { STAMP_DEFS } from "../stamps.js";

export class ResultScreen {
  constructor(app) {
    this.app = app;
    this.container = null;
  }

  enter() {
    this.container = document.createElement("div");
    this.container.id = "screen-result";
    this.container.className = "screen-overlay active hud-layer";

    this.container.innerHTML = `
      <div class="result-card">
        <div class="result-badge">✦ Masterpiece Completed ✦</div>
        <h2>Your Warli Creation</h2>
        <p class="result-sub">Hand-crafted folk art in rice paste and earthen canvas.</p>
        <div class="result-actions">
          <button id="downloadBtn" class="btn primary">Download PNG ⬇</button>
          <button id="newDesignBtn" class="btn secondary">New Design ↺</button>
        </div>
      </div>
    `;

    document.getElementById("screen-container").appendChild(this.container);

    const downloadBtn = this.container.querySelector("#downloadBtn");
    const newDesignBtn = this.container.querySelector("#newDesignBtn");

    downloadBtn.addEventListener("click", () => this.downloadPNG());
    newDesignBtn.addEventListener("click", () => this.newDesign());

    this.app.registerInteractiveTarget("downloadBtn", () => this.downloadPNG(), downloadBtn);
    this.app.registerInteractiveTarget("newDesignBtn", () => this.newDesign(), newDesignBtn);
  }

  downloadPNG() {
    // Generate clean render without any UI, cursor, or overlays
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = this.app.W;
    exportCanvas.height = this.app.H;
    const g = exportCanvas.getContext("2d");

    // Draw background
    this.app.canvasRenderer.drawBackground(g, this.app.currentCanvasType, this.app.selectedSaadiColor);

    // Draw all finished stamps & freehand motifs
    const paintColor = this.app.canvasRenderer.getPaintColor(this.app.currentCanvasType);
    (this.app.designStamps || []).forEach((st) => {
      if (st.isFreehand) {
        this.app.drawItem(g, st, 0);
      } else {
        const def = STAMP_DEFS[st.stampType];
        if (def) def.draw(g, st.x, st.y, st.scale, paintColor);
      }
    });

    // Also draw any freehand drawn items if present
    if (this.app.items && this.app.items.length > 0) {
      this.app.items.forEach((it) => this.app.drawItem(g, it, performance.now() / 1000));
    }

    exportCanvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mohalla-warli-${this.app.currentCanvasType}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }, "image/png");
  }

  newDesign() {
    this.app.designStamps = [];
    this.app.items = [];
    this.app.goToScreen("CANVAS_SELECT");
  }

  exit() {
    this.app.unregisterInteractiveTarget("downloadBtn");
    this.app.unregisterInteractiveTarget("newDesignBtn");
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  update(now) {
    const dBtn = this.container.querySelector("#downloadBtn");
    const nBtn = this.container.querySelector("#newDesignBtn");
    if (dBtn) this.app.checkDwellForElement("downloadBtn", dBtn, now);
    if (nBtn) this.app.checkDwellForElement("newDesignBtn", nBtn, now);
  }

  render(ctx) {
    // Render the finished artwork in all its glory
    const paintColor = this.app.canvasRenderer.getPaintColor(this.app.currentCanvasType);
    (this.app.designStamps || []).forEach((st) => {
      if (st.isFreehand) {
        this.app.drawItem(ctx, st, performance.now() / 1000);
      } else {
        const def = STAMP_DEFS[st.stampType];
        if (def) def.draw(ctx, st.x, st.y, st.scale, paintColor);
      }
    });

    if (this.app.items && this.app.items.length > 0) {
      this.app.items.forEach((it) => this.app.drawItem(ctx, it, performance.now() / 1000));
    }
  }
}
