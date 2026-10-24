/* ---------- Screen 3: CANVAS_SELECT (Wall, Painting Frame, and Saadi Cards) ---------- */

import { CANVAS_TYPES, SAADI_COLORS } from "../canvasRenderer.js";

export class CanvasSelectScreen {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.selectedSaadiColor = 0;
    this.cardElements = new Map();
  }

  enter() {
    this.container = document.createElement("div");
    this.container.id = "screen-canvas-select";
    this.container.className = "screen-overlay active";

    this.container.innerHTML = `
      <div class="select-wrapper">
        <div class="select-nav">
          <button id="backToStartBtn" class="btn secondary back-btn" title="Return to start (Camera / Mouse selection)">← Back to Start</button>
        </div>
        <header class="select-header">
          <h2 class="section-title">Choose Your Canvas</h2>
          <p class="select-subtitle">Select by pointing or holding your hand over a card for 1 second</p>
        </header>

        <div class="cards-grid">
          <!-- Card 1: Mud Wall -->
          <div class="canvas-card" data-canvas="${CANVAS_TYPES.WALL}" id="card-wall" tabindex="0" role="button">
            <div class="card-preview wall-preview">
              <div class="preview-motif">✦</div>
            </div>
            <div class="card-info">
              <h3>Mud Wall (गोबर-माती)</h3>
              <p>Traditional village dwelling wall with rich earthen terracotta texture and rice-paste white paint.</p>
              <div class="card-tag">Authentic Classic</div>
            </div>
            <div class="dwell-indicator"></div>
          </div>

          <!-- Card 2: Painting Frame -->
          <div class="canvas-card" data-canvas="${CANVAS_TYPES.FRAME}" id="card-frame" tabindex="0" role="button">
            <div class="card-preview frame-preview">
              <div class="preview-inner-paper">
                <div class="preview-motif ochre">✦</div>
              </div>
            </div>
            <div class="card-info">
              <h3>Framed Art (चित्र-पटल)</h3>
              <p>Handmade cream parchment paper mounted in a carved teakwood frame. Painted in warm red-ochre.</p>
              <div class="card-tag">Exhibition Piece</div>
            </div>
            <div class="dwell-indicator"></div>
          </div>

          <!-- Card 3: Saadi -->
          <div class="canvas-card" data-canvas="${CANVAS_TYPES.SAADI}" id="card-saadi" tabindex="0" role="button">
            <div class="card-preview saadi-preview" id="saadiCardPreview">
              <div class="saadi-preview-border"></div>
              <div class="saadi-preview-pallu"></div>
            </div>
            <div class="card-info">
              <h3>Saadi Saree (काठपदरी साडी)</h3>
              <p>Lustrous silk textile adorned with geometric border motifs and an elaborate festive pallu.</p>
              <div class="saadi-swatches" id="saadiSwatches">
                ${SAADI_COLORS.map((col, idx) => `
                  <button type="button" class="swatch ${idx === 0 ? "active" : ""}" data-idx="${idx}" style="background:${col.base}" title="${col.name}"></button>
                `).join("")}
              </div>
            </div>
            <div class="dwell-indicator"></div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("screen-container").appendChild(this.container);

    // Setup interactive card listeners
    const cards = this.container.querySelectorAll(".canvas-card");
    cards.forEach((card) => {
      const type = card.dataset.canvas;
      this.cardElements.set(card.id, { element: card, type });

      // Click / touch
      card.addEventListener("click", (e) => {
        // If clicking on swatch button inside saadi, don't trigger card selection immediately
        if (e.target.closest(".swatch")) return;
        this.selectCanvas(type);
      });

      // Keyboard
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.selectCanvas(type);
        }
      });

      // Register interactive dwell/pinch target
      this.app.registerInteractiveTarget(card.id, () => {
        this.selectCanvas(type);
      }, card);
    });

    // Back to start button
    const backBtn = this.container.querySelector("#backToStartBtn");
    if (backBtn) {
      backBtn.addEventListener("click", () => this.app.goToScreen("INTRO"));
      this.app.registerInteractiveTarget("backToStartBtn", () => this.app.goToScreen("INTRO"), backBtn);
    }

    // Saadi swatches
    const swatches = this.container.querySelectorAll(".swatch");
    const saadiPreview = this.container.querySelector("#saadiCardPreview");
    swatches.forEach((swatch) => {
      swatch.addEventListener("click", (e) => {
        e.stopPropagation();
        swatches.forEach((s) => s.classList.remove("active"));
        swatch.classList.add("active");
        this.selectedSaadiColor = parseInt(swatch.dataset.idx, 10);
        const col = SAADI_COLORS[this.selectedSaadiColor];
        if (saadiPreview) {
          saadiPreview.style.background = col.base;
        }
      });
    });
  }

  selectCanvas(canvasType) {
    this.app.currentCanvasType = canvasType;
    this.app.selectedSaadiColor = this.selectedSaadiColor;
    this.app.goToScreen("DESIGN");
  }

  exit() {
    this.app.unregisterInteractiveTarget("backToStartBtn");
    this.cardElements.forEach((val, id) => {
      this.app.unregisterInteractiveTarget(id);
    });
    this.cardElements.clear();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  update(now) {
    const backBtn = this.container ? this.container.querySelector("#backToStartBtn") : null;
    if (backBtn) {
      this.app.checkDwellForElement("backToStartBtn", backBtn, now);
    }

    // Check dwell over each card
    this.cardElements.forEach(({ element }, id) => {
      this.app.checkDwellForElement(id, element, now);
    });
  }

  render(ctx) {}
}
