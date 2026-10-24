/* ---------- Main Application Orchestrator & Screen State Machine ---------- */

import { HandTracker, HAND_STATES } from "./hand.js";
import { CanvasRenderer, CANVAS_TYPES } from "./canvasRenderer.js";
import { recognise } from "./recognise.js";
import { IntroScreen } from "./screens/intro.js";
import { StoryScreen } from "./screens/story.js";
import { CanvasSelectScreen } from "./screens/canvasSelect.js";
import { DesignScreen } from "./screens/design.js";
import { TraceScreen } from "./screens/trace.js";
import { ResultScreen } from "./screens/result.js";

class MohallaApp {
  constructor() {
    this.canvas = document.getElementById("stage");
    this.ctx = this.canvas.getContext("2d");
    this.video = document.getElementById("video");
    this.screenContainer = document.getElementById("screen-container");

    this.W = 1280;
    this.H = 720;
    this.canvas.width = this.W;
    this.canvas.height = this.H;

    this.canvasRenderer = new CanvasRenderer(this.W, this.H);
    this.currentCanvasType = CANVAS_TYPES.WALL;
    this.selectedSaadiColor = 0;

    this.tracker = new HandTracker();
    this.useMouse = false;
    this.showDebug = false;

    // Items painted on canvas (freehand shapes)
    this.items = [];
    this.designStamps = [];
    this.currentStroke = null;
    this.isMouseDown = false;

    // Interactive element registry for dwell / pinch clicks
    this.interactiveTargets = new Map(); // id -> { callback, element }

    // Screen Management
    this.screens = {
      INTRO: new IntroScreen(this),
      STORY: new StoryScreen(this),
      CANVAS_SELECT: new CanvasSelectScreen(this),
      DESIGN: new DesignScreen(this),
      TRACE: new TraceScreen(this),
      RESULT: new ResultScreen(this)
    };
    this.currentScreenKey = null;
    this.currentScreen = null;
    this.isTransitioning = false;

    this.initEvents();
    this.resize();
  }

  async initHandTracking() {
    return await this.tracker.startCamera(this.video);
  }

  initEvents() {
    window.addEventListener("resize", () => this.resize());

    // Debug toggle (D key) & shortcuts
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (k === "d") {
        this.showDebug = !this.showDebug;
      } else if (k === "z" && this.currentScreenKey === "DESIGN") {
        this.screens.DESIGN.undo();
      } else if (k === "c" && this.currentScreenKey === "DESIGN") {
        this.screens.DESIGN.clear();
      }
    });

    // Hand tracker callbacks
    this.tracker.onStrokePoint = (pt) => this.handlePinchMove(pt);
    this.tracker.onErasePoint = (pt, radius) => this.handleErasePoint(pt, radius);
    this.tracker.onStateChange = (newState, oldState) => {
      if (newState === HAND_STATES.DRAWING) {
        if (this.tracker.cursor) this.handlePinchStart(this.tracker.cursor);
      } else if (oldState === HAND_STATES.DRAWING) {
        this.handlePinchEnd();
      }
    };
    this.tracker.onDwellComplete = (targetId) => {
      const target = this.interactiveTargets.get(targetId);
      if (target && target.callback) {
        target.callback();
      }
    };

    // Prevent context menu on canvas for right-click erasing
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Pointer fallback (Mouse / Touch)
    this.isRightClickDown = false;
    this.canvas.addEventListener("pointerdown", (e) => {
      const pt = this.screenToCanvasPoint(e.clientX, e.clientY);
      this.tracker.cursor = pt;

      if (e.button === 2 || e.shiftKey) {
        // Right click or Shift+Click = Erase
        this.isRightClickDown = true;
        this.tracker.state = HAND_STATES.ERASING;
        this.handleErasePoint(pt, 32);
      } else {
        // Left click = Point to Draw
        this.isMouseDown = true;
        this.tracker.state = HAND_STATES.DRAWING;
        this.handlePinchStart(pt);
      }
    });

    window.addEventListener("pointermove", (e) => {
      const pt = this.screenToCanvasPoint(e.clientX, e.clientY);
      if (this.isMouseDown || this.isRightClickDown || this.useMouse) {
        this.tracker.cursor = pt;
      }
      if (this.isRightClickDown) {
        this.handleErasePoint(pt, 32);
      } else if (this.isMouseDown) {
        this.handlePinchMove(pt);
      }
    });

    const onPointerUp = (e) => {
      if (this.isRightClickDown) {
        this.isRightClickDown = false;
        this.tracker.state = HAND_STATES.HOVER;
      }
      if (this.isMouseDown) {
        this.isMouseDown = false;
        this.tracker.state = HAND_STATES.HOVER;
        this.handlePinchEnd();
      }
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  handleErasePoint(pt, radius = 32) {
    if (this.currentScreenKey === "DESIGN") {
      this.screens.DESIGN.eraseAt(pt, radius);
    } else if (this.currentScreenKey === "TRACE") {
      this.screens.TRACE.eraseAt(pt, radius);
    } else if (this.items && this.items.length > 0) {
      // Erase freehand shapes
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        let hit = false;
        if (it.type === "circle") {
          hit = Math.hypot(it.cx - pt.x, it.cy - pt.y) <= radius + it.r;
        } else if (it.type === "line") {
          hit = Math.hypot(it.a.x - pt.x, it.a.y - pt.y) <= radius || Math.hypot(it.b.x - pt.x, it.b.y - pt.y) <= radius;
        } else if (it.pts) {
          hit = it.pts.some((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= radius);
        }
        if (hit) {
          this.items.splice(i, 1);
        }
      }
    }
  }

  handlePinchStart(pt) {
    // 1. Check if pinch started over interactive target button/card
    for (const [id, target] of this.interactiveTargets.entries()) {
      if (target.element) {
        const rect = target.element.getBoundingClientRect();
        const screenPt = this.canvasToScreenPoint(pt.x, pt.y);
        if (screenPt.x >= rect.left && screenPt.x <= rect.right &&
            screenPt.y >= rect.top && screenPt.y <= rect.bottom) {
          target.callback();
          return;
        }
      }
    }

    // 2. Delegate to active screen
    if (this.currentScreenKey === "DESIGN") {
      this.screens.DESIGN.handlePinchStart(pt);
    } else if (this.currentScreenKey === "TRACE") {
      this.screens.TRACE.processPinchPoint(pt);
    } else {
      // Freehand drawing fallback
      this.currentStroke = [pt];
    }
  }

  handlePinchMove(pt) {
    if (this.currentScreenKey === "DESIGN") {
      this.screens.DESIGN.handlePinchMove(pt);
    } else if (this.currentScreenKey === "TRACE") {
      this.screens.TRACE.processPinchPoint(pt);
    } else if (this.currentStroke) {
      const last = this.currentStroke[this.currentStroke.length - 1];
      if (Math.hypot(last.x - pt.x, last.y - pt.y) >= 3.0) {
        this.currentStroke.push(pt);
      }
    }
  }

  handlePinchEnd() {
    const pt = this.tracker.cursor || { x: 0, y: 0 };
    if (this.currentScreenKey === "DESIGN") {
      this.screens.DESIGN.handlePinchEnd(pt);
    } else if (this.currentScreenKey === "TRACE") {
      this.screens.TRACE.endPinchStroke();
    } else if (this.currentStroke) {
      const shape = recognise(this.currentStroke);
      if (shape) {
        this.items.push(shape);
      }
      this.currentStroke = null;
    }
  }

  registerInteractiveTarget(id, callback, element) {
    this.interactiveTargets.set(id, { callback, element });
  }

  unregisterInteractiveTarget(id) {
    this.interactiveTargets.delete(id);
  }

  checkDwellForElement(id, element, now) {
    if (!this.tracker.cursor || !element) return;
    const screenPt = this.canvasToScreenPoint(this.tracker.cursor.x, this.tracker.cursor.y);
    const rect = element.getBoundingClientRect();
    const isHovering = screenPt.x >= rect.left && screenPt.x <= rect.right &&
                       screenPt.y >= rect.top && screenPt.y <= rect.bottom;
    this.tracker.updateDwell(id, isHovering, now);
  }

  screenToCanvasPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * this.W) / rect.width,
      y: ((clientY - rect.top) * this.H) / rect.height
    };
  }

  canvasToScreenPoint(canvasX, canvasY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + (canvasX * rect.width) / this.W,
      y: rect.top + (canvasY * rect.height) / this.H
    };
  }

  resize() {
    const scale = Math.min(window.innerWidth / this.W, window.innerHeight / this.H);
    this.canvas.style.width = `${this.W * scale}px`;
    this.canvas.style.height = `${this.H * scale}px`;
  }

  goToScreen(screenKey) {
    if (!this.screens[screenKey]) return;
    if (this.currentScreen === this.screens[screenKey]) return;

    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeDuration = calm ? 0 : 250;

    if (this.currentScreen) {
      this.screenContainer.style.opacity = "0";
      setTimeout(() => {
        this.currentScreen.exit();
        this.currentScreenKey = screenKey;
        this.currentScreen = this.screens[screenKey];
        this.currentScreen.enter();
        this.screenContainer.style.opacity = "1";
      }, fadeDuration);
    } else {
      this.currentScreenKey = screenKey;
      this.currentScreen = this.screens[screenKey];
      this.currentScreen.enter();
    }
  }

  start() {
    this.goToScreen("INTRO");
    requestAnimationFrame((t) => this.loop(t));
  }

  loop(timestamp) {
    const now = performance.now();

    // 1. Update Hand Tracking
    this.tracker.update(now, this.W, this.H);

    // 2. Update Active Screen
    if (this.currentScreen && this.currentScreen.update) {
      this.currentScreen.update(now);
    }

    // 3. Render Canvas
    this.render(now / 1000);

    requestAnimationFrame((t) => this.loop(t));
  }

  render(t) {
    // 1. Draw Canvas Background
    this.canvasRenderer.drawBackground(this.ctx, this.currentCanvasType, this.selectedSaadiColor);

    // 2. Screen-specific rendering (stamps, guides, etc.)
    if (this.currentScreen && this.currentScreen.render) {
      this.currentScreen.render(this.ctx);
    }

    // 3. Live freehand stroke preview if drawing
    if (this.currentStroke && this.currentStroke.length > 1) {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(251, 243, 228, 0.85)";
      this.ctx.lineWidth = 5;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";
      this.ctx.beginPath();
      this.ctx.moveTo(this.currentStroke[0].x, this.currentStroke[0].y);
      for (const pt of this.currentStroke) {
        this.ctx.lineTo(pt.x, pt.y);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 4. Cursor Rendering
    this.tracker.drawCursor(this.ctx);

    // 5. Debug Overlay if enabled
    if (this.showDebug) {
      this.tracker.drawDebugOverlay(this.ctx);
    }
  }

  drawItem(ctx, it, t) {
    const paintColor = this.canvasRenderer.getPaintColor(this.currentCanvasType);
    ctx.save();
    ctx.fillStyle = paintColor;
    ctx.strokeStyle = paintColor;
    ctx.lineWidth = 5.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(251,243,228,0.35)";
    ctx.shadowBlur = 4;

    switch (it.type) {
      case "circle":
        ctx.beginPath();
        ctx.arc(it.cx, it.cy, it.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "poly":
        ctx.beginPath();
        it.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case "blob":
        ctx.beginPath();
        it.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        break;
      case "line":
        ctx.beginPath();
        ctx.moveTo(it.a.x, it.a.y);
        ctx.lineTo(it.b.x, it.b.y);
        ctx.stroke();
        break;
      case "curve":
        ctx.beginPath();
        it.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        break;
    }
    ctx.restore();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const app = new MohallaApp();
  window.app = app;
  app.start();
});
