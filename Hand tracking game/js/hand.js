/* ---------- Hand Tracking: Index Pointing to Draw, Index+Middle Together to Erase ---------- */

import { PointOneEuroFilter } from "./filters.js";
import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Precision & Hysteresis Constants
export const TRACKING_CONFIG = {
  FRAMES_TO_ACTIVATE: 2,        // consecutive frames to activate drawing or erasing
  FRAMES_TO_DEACTIVATE: 2,      // consecutive frames to release back to hover
  LOST_HAND_TOLERANCE_MS: 150,  // tolerate hand dropouts up to 150ms without cutting stroke
  MIN_MOVE_PX: 4.5,             // ignore jitter smaller than 4.5 px to eliminate shaky tremors
  ONE_EURO_MIN_CUTOFF: 0.35,    // lower cutoff heavily filters slow finger shakiness
  ONE_EURO_BETA: 0.015,         // speed coefficient for natural low-latency drawing
  FINGER_TOGETHER_RATIO: 0.38,  // index and middle tip gap / palmSize for erasing
  ERASER_RADIUS_PX: 32          // radius of eraser circle
};

export const HAND_STATES = {
  IDLE: "IDLE",
  HOVER: "HOVER",
  DRAWING: "DRAWING",
  ERASING: "ERASING"
};

export class HandTracker {
  constructor() {
    this.state = HAND_STATES.IDLE;
    this.landmarker = null;
    this.stream = null;
    this.video = null;

    this.filter = new PointOneEuroFilter({
      minCutoff: TRACKING_CONFIG.ONE_EURO_MIN_CUTOFF,
      beta: TRACKING_CONFIG.ONE_EURO_BETA
    });

    this.cursor = null;            // Smoothed { x, y } in canvas coords
    this.rawPoint = null;          // Raw detected { x, y }
    this.handLandmarks2D = null;
    this.lastHandSeenTime = 0;

    // Gesture detection counters for hysteresis
    this.drawMatchFrames = 0;
    this.eraseMatchFrames = 0;
    this.releaseFrames = 0;

    this.isCameraRunning = false;
    this.lastVideoTime = -1;

    // Callbacks
    this.onStateChange = null;     // (newState, oldState) => {}
    this.onStrokePoint = null;     // ({ x, y }) => {}
    this.onStrokeEnd = null;       // () => {}
    this.onErasePoint = null;      // ({ x, y }, radius) => {}
    this.onEraseEnd = null;        // () => {}
    this.onDwellComplete = null;   // (targetId) => {}

    // Dwell detection
    this.dwellTarget = null;
    this.dwellStartTime = 0;
    this.dwellDurationMs = 1000;
    this.dwellProgress = 0;

    // Debug stats
    this.fps = 0;
    this.fpsCounter = 0;
    this.lastFpsTime = performance.now();
    this.debugGesture = "None";
    this.debugGapRatio = 0;
  }

  async init(videoElement) {
    this.video = videoElement;
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

    let landmarkerInstance = null;
    try {
      landmarkerInstance = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    } catch (gpuError) {
      console.warn("GPU delegate failed, falling back to CPU", gpuError);
      landmarkerInstance = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    }

    this.landmarker = landmarkerInstance;
    return this.landmarker;
  }

  async startCamera(videoElement) {
    if (!this.landmarker) {
      await this.init(videoElement);
    }
    this.video = videoElement;
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    this.isCameraRunning = true;
    return this.stream;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    this.isCameraRunning = false;
    this.transitionTo(HAND_STATES.IDLE);
  }

  transitionTo(newState) {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;

    if (oldState === HAND_STATES.DRAWING && newState !== HAND_STATES.DRAWING) {
      if (this.onStrokeEnd) this.onStrokeEnd();
    }
    if (oldState === HAND_STATES.ERASING && newState !== HAND_STATES.ERASING) {
      if (this.onEraseEnd) this.onEraseEnd();
    }

    if (this.onStateChange) {
      this.onStateChange(newState, oldState);
    }
  }

  dist2D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  toPx(lm, W, H) {
    return { x: (1 - lm.x) * W, y: lm.y * H };
  }

  update(now, canvasWidth, canvasHeight) {
    this.fpsCounter++;
    if (now - this.lastFpsTime >= 500) {
      this.fps = Math.round((this.fpsCounter * 1000) / (now - this.lastFpsTime));
      this.fpsCounter = 0;
      this.lastFpsTime = now;
    }

    if (!this.isCameraRunning || !this.landmarker || !this.video) return;

    if (this.video.readyState >= 2 && this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const res = this.landmarker.detectForVideo(this.video, now);
      this.processLandmarks(res, now, canvasWidth, canvasHeight);
    } else {
      // Check lost hand tolerance
      if ((this.state === HAND_STATES.DRAWING || this.state === HAND_STATES.ERASING) &&
          now - this.lastHandSeenTime > TRACKING_CONFIG.LOST_HAND_TOLERANCE_MS) {
        this.transitionTo(HAND_STATES.IDLE);
      }
    }
  }

  processLandmarks(res, now, W, H) {
    const hasHand = res.landmarks && res.landmarks.length > 0;

    if (!hasHand) {
      if (now - this.lastHandSeenTime > TRACKING_CONFIG.LOST_HAND_TOLERANCE_MS) {
        this.handLandmarks2D = null;
        this.transitionTo(HAND_STATES.IDLE);
      }
      return;
    }

    this.lastHandSeenTime = now;
    const lms2D = res.landmarks[0];
    const p = lms2D.map((lm) => this.toPx(lm, W, H));
    this.handLandmarks2D = p;

    // Landmarks index:
    // 0: wrist
    // 4: thumb tip, 3: thumb ip, 2: thumb mcp
    // 8: index tip, 7: index dip, 6: index pip, 5: index mcp
    // 12: middle tip, 11: middle dip, 10: middle pip, 9: middle mcp
    // 16: ring tip, 15: ring dip, 14: ring pip, 13: ring mcp
    // 20: pinky tip, 19: pinky dip, 18: pinky pip, 17: pinky mcp
    const palmSize = this.dist2D(p[0], p[9]) || 1;

    // A finger is extended if its tip is significantly further from the wrist than its PIP joint
    const isExtended = (tip, pip) => this.dist2D(p[tip], p[0]) > this.dist2D(p[pip], p[0]) * 1.14;
    const isCurled = (tip, pip) => this.dist2D(p[tip], p[0]) < this.dist2D(p[pip], p[0]) * 1.10;

    const indexExtended = isExtended(8, 6);
    const middleExtended = isExtended(12, 10);
    const ringCurled = isCurled(16, 14);
    const pinkyCurled = isCurled(20, 18);

    // Tip gap between index and middle fingers
    const tipGap = this.dist2D(p[8], p[12]);
    const tipGapRatio = tipGap / palmSize;
    this.debugGapRatio = tipGapRatio;

    // 1. ERASE GESTURE: Index and Middle fingers both extended and held together side-by-side
    const isEraseGesture = indexExtended && middleExtended && ringCurled && pinkyCurled &&
                          (tipGapRatio < TRACKING_CONFIG.FINGER_TOGETHER_RATIO);

    // 2. DRAW GESTURE: Index finger extended, middle finger curled, ring & pinky curled
    const isDrawGesture = indexExtended && !middleExtended && ringCurled && pinkyCurled;

    // Target tracking point for cursor:
    let rawTarget = p[8]; // Default to index tip
    if (isEraseGesture) {
      // Midpoint between index and middle tips for eraser
      rawTarget = {
        x: (p[8].x + p[12].x) / 2,
        y: (p[8].y + p[12].y) / 2
      };
      this.debugGesture = "Index + Middle (ERASE)";
    } else if (isDrawGesture) {
      rawTarget = p[8];
      this.debugGesture = "Index Pointing (DRAW)";
    } else {
      this.debugGesture = "Hover / Neutral";
    }

    this.rawPoint = rawTarget;
    const nowSec = now / 1000;
    this.cursor = this.filter.filter(rawTarget.x, rawTarget.y, nowSec);

    // State machine transitions with hysteresis
    if (isDrawGesture) {
      this.drawMatchFrames++;
      this.eraseMatchFrames = 0;
      this.releaseFrames = 0;

      if (this.drawMatchFrames >= TRACKING_CONFIG.FRAMES_TO_ACTIVATE) {
        this.transitionTo(HAND_STATES.DRAWING);
        if (this.onStrokePoint) this.onStrokePoint(this.cursor);
      }
    } else if (isEraseGesture) {
      this.eraseMatchFrames++;
      this.drawMatchFrames = 0;
      this.releaseFrames = 0;

      if (this.eraseMatchFrames >= TRACKING_CONFIG.FRAMES_TO_ACTIVATE) {
        this.transitionTo(HAND_STATES.ERASING);
        if (this.onErasePoint) this.onErasePoint(this.cursor, TRACKING_CONFIG.ERASER_RADIUS_PX);
      }
    } else {
      this.releaseFrames++;
      this.drawMatchFrames = 0;
      this.eraseMatchFrames = 0;

      if (this.releaseFrames >= TRACKING_CONFIG.FRAMES_TO_DEACTIVATE) {
        this.transitionTo(HAND_STATES.HOVER);
      } else {
        // Maintain active state momentarily during frame dips
        if (this.state === HAND_STATES.DRAWING && this.onStrokePoint) {
          this.onStrokePoint(this.cursor);
        } else if (this.state === HAND_STATES.ERASING && this.onErasePoint) {
          this.onErasePoint(this.cursor, TRACKING_CONFIG.ERASER_RADIUS_PX);
        }
      }
    }
  }

  // Dwell detection for hover selection
  updateDwell(targetId, isHovering, now) {
    if (!isHovering) {
      if (this.dwellTarget === targetId) {
        this.dwellTarget = null;
        this.dwellProgress = 0;
      }
      return 0;
    }

    if (this.dwellTarget !== targetId) {
      this.dwellTarget = targetId;
      this.dwellStartTime = now;
      this.dwellProgress = 0;
      return 0;
    }

    const elapsed = now - this.dwellStartTime;
    this.dwellProgress = Math.min(1.0, elapsed / this.dwellDurationMs);

    if (this.dwellProgress >= 1.0) {
      if (this.onDwellComplete) {
        this.onDwellComplete(targetId);
      }
      this.dwellTarget = null;
      this.dwellProgress = 0;
    }

    return this.dwellProgress;
  }

  // Draw cursor indicator matching current state
  drawCursor(ctx) {
    if (!this.cursor) return;

    ctx.save();
    const cx = this.cursor.x;
    const cy = this.cursor.y;

    if (this.state === HAND_STATES.DRAWING) {
      // Solid golden drawing tip with ink glow
      ctx.fillStyle = "#ffd27a";
      ctx.shadowColor = "rgba(255, 210, 122, 0.85)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();

      // Precision crosshair dot
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state === HAND_STATES.ERASING) {
      // Soft red/coral eraser disc
      const rad = TRACKING_CONFIG.ERASER_RADIUS_PX;
      ctx.fillStyle = "rgba(255, 90, 80, 0.25)";
      ctx.strokeStyle = "#ff6b6b";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);

      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner eraser badge
      ctx.setLineDash([]);
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ERASE", cx, cy);
    } else {
      // Elegant hovering ring cursor
      ctx.strokeStyle = "rgba(255, 210, 122, 0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Center aiming dot
      ctx.fillStyle = "rgba(255, 210, 122, 0.7)";
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Dwell progress circle
      if (this.dwellProgress > 0) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 19, -Math.PI / 2, -Math.PI / 2 + this.dwellProgress * Math.PI * 2);
        ctx.stroke();
      }
    }

    // Hand skeleton points
    if (this.handLandmarks2D) {
      ctx.fillStyle = "rgba(251, 243, 228, 0.35)";
      for (const p of this.handLandmarks2D) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // Debug overlay (Press D to toggle)
  drawDebugOverlay(ctx, x = 18, y = 18) {
    ctx.save();
    ctx.fillStyle = "rgba(20, 10, 5, 0.85)";
    ctx.strokeStyle = "rgba(255, 210, 122, 0.5)";
    ctx.lineWidth = 1;

    const w = 290;
    const h = 180;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "#ffd27a";
    ctx.font = "bold 13px monospace";
    ctx.fillText("--- GESTURE DEBUG (D) ---", x + 12, y + 22);

    ctx.fillStyle = "#fbf3e4";
    ctx.font = "12px monospace";
    ctx.fillText(`State:        ${this.state}`, x + 12, y + 46);
    ctx.fillText(`Detected:     ${this.debugGesture}`, x + 12, y + 68);
    ctx.fillText(`Tip Gap:      ${this.debugGapRatio.toFixed(3)} (th: ${TRACKING_CONFIG.FINGER_TOGETHER_RATIO})`, x + 12, y + 90);
    ctx.fillText(`Frames:       draw:${this.drawMatchFrames} erase:${this.eraseMatchFrames}`, x + 12, y + 112);
    ctx.fillText(`FPS:          ${this.fps} fps`, x + 12, y + 134);
    ctx.fillText(`Mode: Point=Draw, 2-Fingers=Erase`, x + 12, y + 158);

    ctx.restore();
  }
}
