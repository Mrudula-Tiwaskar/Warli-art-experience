/* ---------- Screen 4: DESIGN (Stamp Palette, Freehand Drawing, Blank Canvas, & Scale) ---------- */

import { STAMP_DEFS } from "../stamps.js";
import { CANVAS_TYPES } from "../canvasRenderer.js";
import { recognise } from "../recognise.js";

export class DesignScreen {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.placedStamps = [];       // Array of items (stamps or freehand shapes)
    this.selectedStampIndex = -1;
    this.activeDrag = null;
    this.mode = "stamps";          // "stamps" | "freehand"
    this.activeFreehandStroke = null;
  }

  enter() {
    this.container = document.createElement("div");
    this.container.id = "screen-design";
    this.container.className = "screen-overlay active hud-layer";

    const paintColor = this.app.canvasRenderer.getPaintColor(this.app.currentCanvasType);

    this.container.innerHTML = `
      <!-- Left Sidebar: Stamp Palette & Freehand Mode Toggle -->
      <aside class="stamp-palette" id="stampPalette">
        <div class="palette-header">
          <div class="mode-toggle">
            <button id="modeStampsBtn" class="mode-btn active" title="Use Warli Motif Stamps">✦ Stamps</button>
            <button id="modeFreehandBtn" class="mode-btn" title="Freehand Point-to-Draw Mode">✏ Freehand</button>
          </div>
          <p class="palette-sub" id="modeDescription">Point index to drag stamps</p>
        </div>
        <div class="stamp-list" id="stampList"></div>
        <div class="palette-trash" id="paletteTrash">
          <span>🗑 Drag here to delete</span>
        </div>
      </aside>

      <!-- Top HUD: Canvas Indicator & Blank Canvas Quick-Switch -->
      <div class="top-hud">
        <button id="designBackBtn" class="btn secondary back-btn-small" title="Return to Canvas Selection">← Canvas</button>
        <span class="hud-pill" id="canvasIndicator">Canvas: ${this.getCanvasName()}</span>
        <span class="hud-pill" id="stampCount">Elements: 0</span>
        <button id="blankCanvasBtn" class="btn text-btn-small" title="Clear all and start with a blank canvas">Blank Canvas ↺</button>
      </div>

      <!-- Bottom Control Bar -->
      <div class="design-bar">
        <div class="scale-group" id="scaleGroup">
          <span class="control-label">Scale:</span>
          <button id="scaleDownBtn" class="btn icon-btn" title="Scale Down (-)">−</button>
          <span id="scaleValue">100%</span>
          <button id="scaleUpBtn" class="btn icon-btn" title="Scale Up (+)">+</button>
        </div>
        <button id="undoBtn" class="btn" title="Undo (Z)">Undo</button>
        <button id="clearBtn" class="btn" title="Clear All (C)">Clear</button>
        <button id="doneTraceBtn" class="btn primary" title="Proceed to Trace Mode">Done, now trace ➔</button>
      </div>
    `;

    document.getElementById("screen-container").appendChild(this.container);

    this.renderStampThumbnails(paintColor);
    this.setupListeners();

    // Register interactive targets for hand tracking dwell / pinch
    this.app.registerInteractiveTarget("designBackBtn", () => this.app.goToScreen("CANVAS_SELECT"), this.container.querySelector("#designBackBtn"));
    this.app.registerInteractiveTarget("doneTraceBtn", () => this.proceedToTrace(), this.container.querySelector("#doneTraceBtn"));
    this.app.registerInteractiveTarget("undoBtn", () => this.undo(), this.container.querySelector("#undoBtn"));
    this.app.registerInteractiveTarget("clearBtn", () => this.clear(), this.container.querySelector("#clearBtn"));
    this.app.registerInteractiveTarget("scaleUpBtn", () => this.scaleSelected(1.2), this.container.querySelector("#scaleUpBtn"));
    this.app.registerInteractiveTarget("scaleDownBtn", () => this.scaleSelected(0.8), this.container.querySelector("#scaleDownBtn"));
    this.app.registerInteractiveTarget("modeStampsBtn", () => this.setMode("stamps"), this.container.querySelector("#modeStampsBtn"));
    this.app.registerInteractiveTarget("modeFreehandBtn", () => this.setMode("freehand"), this.container.querySelector("#modeFreehandBtn"));
    this.app.registerInteractiveTarget("blankCanvasBtn", () => this.startBlankCanvas(), this.container.querySelector("#blankCanvasBtn"));
  }

  getCanvasName() {
    if (this.app.currentCanvasType === CANVAS_TYPES.FRAME) return "Framed Art";
    if (this.app.currentCanvasType === CANVAS_TYPES.SAADI) return "Saadi Saree";
    return "Mud Wall";
  }

  renderStampThumbnails(paintColor) {
    const list = this.container.querySelector("#stampList");
    list.innerHTML = "";

    Object.values(STAMP_DEFS).forEach((stamp) => {
      const item = document.createElement("div");
      item.className = "stamp-item";
      item.dataset.stampType = stamp.id;
      item.tabIndex = 0;

      if (stamp.svgPath) {
        // SVG-based stamp: use <img> with the blob URL baked by the stamp loader
        const wrapper = document.createElement("div");
        wrapper.className = "stamp-svg-thumb";

        const imgEl = document.createElement("img");
        imgEl.alt = stamp.name;
        imgEl.draggable = false;

        // Helper: set the blob URL once the cache entry is ready
        const trySetSrc = () => {
          // Access the module-private cache via a public helper
          const entry = STAMP_DEFS[stamp.id]._getCacheEntry
            ? STAMP_DEFS[stamp.id]._getCacheEntry()
            : null;
          if (entry && entry.state === 'ok' && entry.img && entry.img.src) {
            imgEl.src = entry.img.src;
          }
        };

        // Poll briefly until the image is ready (max ~3s), then stop
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          trySetSrc();
          if (imgEl.src || attempts > 30) clearInterval(poll);
        }, 100);

        wrapper.appendChild(imgEl);
        item.appendChild(wrapper);
      } else {
        // Procedural stamp: draw to a canvas thumbnail
        const thumbCanvas = document.createElement("canvas");
        thumbCanvas.width = 64;
        thumbCanvas.height = 64;
        const g = thumbCanvas.getContext("2d");
        stamp.draw(g, 32, 32, 0.65, paintColor);
        item.appendChild(thumbCanvas);
      }

      const label = document.createElement("span");
      label.className = "stamp-label";
      label.textContent = stamp.name;

      item.appendChild(label);
      list.appendChild(item);

      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        const pt = this.app.screenToCanvasPoint(e.clientX, e.clientY);
        this.activeDrag = {
          stampType: stamp.id,
          fromPalette: true,
          stampIndex: -1,
          x: pt.x,
          y: pt.y,
          scale: 1.0
        };
      });
    });
  }


  setupListeners() {
    this.container.querySelector("#scaleUpBtn").addEventListener("click", () => this.scaleSelected(1.2));
    this.container.querySelector("#scaleDownBtn").addEventListener("click", () => this.scaleSelected(0.8));
    this.container.querySelector("#undoBtn").addEventListener("click", () => this.undo());
    this.container.querySelector("#clearBtn").addEventListener("click", () => this.clear());
    this.container.querySelector("#doneTraceBtn").addEventListener("click", () => this.proceedToTrace());

    this.container.querySelector("#modeStampsBtn").addEventListener("click", () => this.setMode("stamps"));
    this.container.querySelector("#modeFreehandBtn").addEventListener("click", () => this.setMode("freehand"));
    this.container.querySelector("#blankCanvasBtn").addEventListener("click", () => this.startBlankCanvas());
    this.container.querySelector("#designBackBtn").addEventListener("click", () => this.app.goToScreen("CANVAS_SELECT"));
  }

  setMode(mode) {
    this.mode = mode;
    const stampsBtn = this.container.querySelector("#modeStampsBtn");
    const freehandBtn = this.container.querySelector("#modeFreehandBtn");
    const desc = this.container.querySelector("#modeDescription");
    const palette = this.container.querySelector("#stampPalette");

    if (mode === "freehand") {
      stampsBtn.classList.remove("active");
      freehandBtn.classList.add("active");
      desc.textContent = "Point index to draw clean shapes";
      palette.classList.add("freehand-active");
    } else {
      freehandBtn.classList.remove("active");
      stampsBtn.classList.add("active");
      desc.textContent = "Point index to drag stamps";
      palette.classList.remove("freehand-active");
    }
  }

  startBlankCanvas() {
    this.clear();
    this.setMode("freehand");
  }

  undo() {
    if (this.placedStamps.length > 0) {
      this.placedStamps.pop();
      this.selectedStampIndex = this.placedStamps.length - 1;
      this.updateCounts();
    }
  }

  clear() {
    this.placedStamps = [];
    this.selectedStampIndex = -1;
    this.activeFreehandStroke = null;
    this.updateCounts();
  }

  scaleSelected(factor) {
    if (this.selectedStampIndex >= 0 && this.selectedStampIndex < this.placedStamps.length) {
      const st = this.placedStamps[this.selectedStampIndex];
      st.scale = Math.max(0.4, Math.min(2.8, (st.scale || 1.0) * factor));
      this.container.querySelector("#scaleValue").textContent = `${Math.round(st.scale * 100)}%`;
    }
  }

  updateCounts() {
    const el = this.container.querySelector("#stampCount");
    if (el) el.textContent = `Elements: ${this.placedStamps.length}`;
  }

  proceedToTrace() {
    if (this.placedStamps.length === 0) {
      alert("Place at least one stamp or draw a shape on the canvas before continuing to trace!");
      return;
    }
    this.app.designStamps = this.placedStamps.slice();
    this.app.goToScreen("TRACE");
  }

  eraseAt(pt, radius = 32) {
    let erased = false;
    for (let i = this.placedStamps.length - 1; i >= 0; i--) {
      const it = this.placedStamps[i];
      if (it.isFreehand) {
        let hit = false;
        if (it.type === "circle") {
          hit = Math.hypot(it.cx - pt.x, it.cy - pt.y) <= radius + it.r;
        } else if (it.type === "line") {
          hit = Math.hypot(it.a.x - pt.x, it.a.y - pt.y) <= radius || Math.hypot(it.b.x - pt.x, it.b.y - pt.y) <= radius;
        } else if (it.pts) {
          hit = it.pts.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= radius);
        }
        if (hit) {
          this.placedStamps.splice(i, 1);
          erased = true;
        }
      } else {
        const def = STAMP_DEFS[it.stampType];
        const size = def ? Math.max(def.width, def.height) * (it.scale || 1) * 0.5 : 25;
        const d = Math.hypot(it.x - pt.x, it.y - pt.y);
        if (d <= radius + size) {
          this.placedStamps.splice(i, 1);
          erased = true;
        }
      }
    }
    if (erased) {
      this.selectedStampIndex = this.placedStamps.length - 1;
      this.updateCounts();
    }
  }

  findStampAt(x, y) {
    for (let i = this.placedStamps.length - 1; i >= 0; i--) {
      const it = this.placedStamps[i];
      if (!it.isFreehand) {
        const def = STAMP_DEFS[it.stampType];
        const halfW = (def.width * (it.scale || 1)) / 2;
        const halfH = (def.height * (it.scale || 1)) / 2;
        if (Math.abs(x - it.x) <= halfW + 10 && Math.abs(y - it.y) <= halfH + 10) {
          return i;
        }
      }
    }
    return -1;
  }

  handlePinchStart(canvasPt) {
    // 1. Check if pointer/pinch is over palette items to drag a stamp
    const paletteEl = document.getElementById("stampPalette");
    if (paletteEl) {
      const rect = paletteEl.getBoundingClientRect();
      const screenPt = this.app.canvasToScreenPoint(canvasPt.x, canvasPt.y);
      if (screenPt.x >= rect.left && screenPt.x <= rect.right &&
          screenPt.y >= rect.top && screenPt.y <= rect.bottom) {
        const items = paletteEl.querySelectorAll(".stamp-item");
        for (const it of items) {
          const r = it.getBoundingClientRect();
          if (screenPt.x >= r.left && screenPt.x <= r.right &&
              screenPt.y >= r.top && screenPt.y <= r.bottom) {
            const stampType = it.dataset.stampType;
            this.activeDrag = {
              stampType,
              fromPalette: true,
              stampIndex: -1,
              x: canvasPt.x,
              y: canvasPt.y,
              scale: 1.0
            };
            return;
          }
        }
      }
    }

    // 2. If in stamps mode, check if clicked on an existing placed stamp to move
    if (this.mode === "stamps") {
      const hitIdx = this.findStampAt(canvasPt.x, canvasPt.y);
      if (hitIdx >= 0) {
        this.selectedStampIndex = hitIdx;
        const st = this.placedStamps[hitIdx];
        this.activeDrag = {
          stampType: st.stampType,
          fromPalette: false,
          stampIndex: hitIdx,
          x: canvasPt.x,
          y: canvasPt.y,
          scale: st.scale,
          offsetX: canvasPt.x - st.x,
          offsetY: canvasPt.y - st.y
        };
        const scaleEl = this.container.querySelector("#scaleValue");
        if (scaleEl) scaleEl.textContent = `${Math.round(st.scale * 100)}%`;
        return;
      }
    }

    // 3. Freehand drawing mode on canvas (or fallback on empty canvas area)
    this.activeFreehandStroke = [canvasPt];
  }

  handlePinchMove(canvasPt) {
    if (this.activeDrag) {
      this.activeDrag.x = canvasPt.x;
      this.activeDrag.y = canvasPt.y;
    } else if (this.activeFreehandStroke) {
      const last = this.activeFreehandStroke[this.activeFreehandStroke.length - 1];
      if (Math.hypot(last.x - canvasPt.x, last.y - canvasPt.y) >= 4.5) {
        this.activeFreehandStroke.push(canvasPt);
      }
    }
  }

  handlePinchEnd(canvasPt) {
    if (this.activeDrag) {
      const paletteEl = document.getElementById("stampPalette");
      const rect = paletteEl ? paletteEl.getBoundingClientRect() : null;
      const screenPt = this.app.canvasToScreenPoint(canvasPt.x, canvasPt.y);
      const inPaletteZone = rect && (screenPt.x <= rect.right + 20);

      if (inPaletteZone) {
        if (!this.activeDrag.fromPalette && this.activeDrag.stampIndex >= 0) {
          this.placedStamps.splice(this.activeDrag.stampIndex, 1);
          this.selectedStampIndex = -1;
          this.updateCounts();
        }
      } else {
        const targetX = canvasPt.x - (this.activeDrag.offsetX || 0);
        const targetY = canvasPt.y - (this.activeDrag.offsetY || 0);

        if (this.activeDrag.fromPalette) {
          if (this.app.currentCanvasType === CANVAS_TYPES.SAADI && (targetY < 85 || targetY > this.app.H - 85)) {
            const borderY = targetY < 85 ? 45 : this.app.H - 45;
            const stampDef = STAMP_DEFS[this.activeDrag.stampType];
            const spacing = Math.max(60, stampDef.width * 1.1);
            const count = Math.floor(this.app.W / spacing);

            for (let i = 1; i < count; i++) {
              this.placedStamps.push({
                isFreehand: false,
                id: Date.now() + "_" + i,
                stampType: this.activeDrag.stampType,
                x: i * spacing,
                y: borderY,
                scale: 0.75
              });
            }
          } else {
            this.placedStamps.push({
              isFreehand: false,
              id: Date.now(),
              stampType: this.activeDrag.stampType,
              x: targetX,
              y: targetY,
              scale: this.activeDrag.scale || 1.0
            });
          }
          this.selectedStampIndex = this.placedStamps.length - 1;
          this.updateCounts();
        } else if (this.activeDrag.stampIndex >= 0) {
          const st = this.placedStamps[this.activeDrag.stampIndex];
          st.x = targetX;
          st.y = targetY;
        }
      }
      this.activeDrag = null;
    } else if (this.activeFreehandStroke) {
      if (this.activeFreehandStroke.length >= 4) {
        const shape = recognise(this.activeFreehandStroke);
        if (shape) {
          this.placedStamps.push({
            isFreehand: true,
            id: Date.now(),
            scale: 1.0,
            ...shape
          });
          this.selectedStampIndex = this.placedStamps.length - 1;
          this.updateCounts();
        }
      }
      this.activeFreehandStroke = null;
    }
  }

  exit() {
    [
      "designBackBtn", "doneTraceBtn", "undoBtn", "clearBtn", "scaleUpBtn", "scaleDownBtn",
      "modeStampsBtn", "modeFreehandBtn", "blankCanvasBtn"
    ].forEach((id) => this.app.unregisterInteractiveTarget(id));

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  update(now) {
    [
      "designBackBtn", "doneTraceBtn", "undoBtn", "clearBtn", "scaleUpBtn", "scaleDownBtn",
      "modeStampsBtn", "modeFreehandBtn", "blankCanvasBtn"
    ].forEach((id) => {
      const el = this.container.querySelector(`#${id}`);
      if (el) this.app.checkDwellForElement(id, el, now);
    });
  }

  render(ctx) {
    const paintColor = this.app.canvasRenderer.getPaintColor(this.app.currentCanvasType);

    // 1. Draw all placed items (both stamps and recognized freehand shapes)
    this.placedStamps.forEach((it, idx) => {
      if (it.isFreehand) {
        this.app.drawItem(ctx, it, performance.now() / 1000);
      } else {
        const def = STAMP_DEFS[it.stampType];
        if (def) {
          def.draw(ctx, it.x, it.y, it.scale || 1.0, paintColor);
          if (idx === this.selectedStampIndex) {
            ctx.save();
            ctx.strokeStyle = "#ffd27a";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            const hw = (def.width * (it.scale || 1)) / 2 + 8;
            const hh = (def.height * (it.scale || 1)) / 2 + 8;
            ctx.strokeRect(it.x - hw, it.y - hh, hw * 2, hh * 2);
            ctx.restore();
          }
        }
      }
    });

    // 2. Draw active stamp drag preview
    if (this.activeDrag) {
      const def = STAMP_DEFS[this.activeDrag.stampType];
      if (def) {
        ctx.save();
        ctx.globalAlpha = 0.85;
        def.draw(ctx, this.activeDrag.x, this.activeDrag.y, this.activeDrag.scale || 1.0, "#ffd27a");
        ctx.restore();
      }
    }

    // 3. Smooth live freehand stroke ribbon (prevents wavy jitter)
    if (this.activeFreehandStroke && this.activeFreehandStroke.length > 1) {
      ctx.save();
      ctx.strokeStyle = paintColor;
      ctx.lineWidth = 5.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(251, 243, 228, 0.45)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(this.activeFreehandStroke[0].x, this.activeFreehandStroke[0].y);
      for (let i = 1; i < this.activeFreehandStroke.length - 1; i++) {
        const mx = (this.activeFreehandStroke[i].x + this.activeFreehandStroke[i + 1].x) / 2;
        const my = (this.activeFreehandStroke[i].y + this.activeFreehandStroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(this.activeFreehandStroke[i].x, this.activeFreehandStroke[i].y, mx, my);
      }
      ctx.lineTo(
        this.activeFreehandStroke[this.activeFreehandStroke.length - 1].x,
        this.activeFreehandStroke[this.activeFreehandStroke.length - 1].y
      );
      ctx.stroke();
      ctx.restore();
    }
  }
}
