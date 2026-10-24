# Mohalla: Warli Folk Art Game

An interactive, multi-screen Warli folk art creation experience powered by HTML5, Vanilla JavaScript (ES Modules), Vanilla CSS, and MediaPipe Tasks Vision HandLandmarker.

---

## How to Run

Because modern browsers enforce CORS restrictions on ES modules (`<script type="module">`), the game must be served through an HTTP server rather than opening `index.html` directly via the `file://` protocol.

### Option 1: Python HTTP Server
Open your terminal in this project folder and run:
```bash
python3 -m http.server 8000
# or on Windows:
python -m http.server 8000
```
Then open your web browser to:
👉 **[http://localhost:8000](http://localhost:8000)**

### Option 2: Windows 1-Click Launcher
Double-click `start-server.bat` in this folder, or run:
```powershell
powershell -ExecutionPolicy Bypass -File server.ps1
```
Then open **[http://localhost:8000](http://localhost:8000)**.

---

## Intro Video Placement

Place your intro video file here:
```text
assets/intro.mp4
```
*Note: If `assets/intro.mp4` is missing or fails to load, the game handles the fallback gracefully and transitions straight to the Story narration screen without crashing.*

---

## Game Flow

1. **INTRO**: Welcome card, gesture/mouse mode selection, and optional intro video (`assets/intro.mp4`).
2. **STORY**: Typewriter narration honoring Warli artisan heritage. Advance by pointing the "Begin" button, clicking, or pressing Space.
3. **CANVAS SELECT**:
   - Choose between:
     - **Mud Wall (`Wall`)**: Traditional earthen terracotta with rice-paste white paint.
     - **Framed Canvas (`Frame`)**: Cream handmade-paper mounted in a teakwood frame with red-ochre paint.
     - **Saadi Saree (`Saadi`)**: Festive textile with border and pallu zones, featuring Maroon, Indigo, or Mustard fabric choices.
     - *Select by pointing or hovering over a card for 1 second (dwell progress ring).*
   - **← Back to Start**: Return to the initial screen at any time to re-choose between Camera and Mouse.
4. **DESIGN**:
   - **← Canvas**: Return to the Canvas Selection screen to switch to a different canvas medium (Wall, Frame, Saadi).
   - **✦ Stamps Mode**: Palette of Warli vector stamps (*Dancer, Tarpa Circle, Tree, House, Sun, Bird, Cow, Peacock*). Drag from palette onto canvas and release to place.
   - **✏ Freehand Draw Mode**: Point your index finger to draw custom shapes directly on the canvas!
   - **Blank Canvas ↺**: Start fresh on a completely blank canvas without pre-placed stamps.
   - **Auto-Straighten & Clean Circles**: Shaky finger lines automatically straighten into clean lines; round strokes snap into perfect geometric circles; curves are smoothed via 3-pass Chaikin smoothing.
   - **Erase & Move**: Two-finger erase scrub removes stamps or drawn shapes. Scale controls (`+`/`−`) adjust motif sizes.
   - **Saadi Border Repetition**: Placing stamps near borders automatically repeats them along the saree rim.
5. **TRACE**:
   - Faint dotted guidelines appear for all design motifs (both stamps and your freehand drawings!).
   - Trace over guidelines with a finger point. Strokes magnetically snap to paths within 20px for crisp lines.
   - Auto-completes at $\ge 90\%$ coverage with a reveal animation.
6. **RESULT**:
   - View your completed masterpiece.
   - Click **Download PNG** to export a clean high-resolution render (free of UI, camera feed, or cursors).
   - Click **New Design** to reset and return to Canvas Select.

---

## Hand Tracking Gestures & Debug Overlay

- **Index Finger Pointing (Draw)**:
  - Extend only your index finger (landmark 8) while curling middle, ring, and pinky fingers to draw rice-paste strokes.
- **Index + Middle Fingers Together (Erase)**:
  - Hold your index and middle fingers extended side-by-side (with ring and pinky curled) to activate the eraser. Scrub over placed stamps, traced lines, or drawn shapes to remove them.
- **Hover & Dwell**:
  - Keep an open or relaxed hand to move the cursor without drawing; hold the cursor over buttons or cards for 1 second to select via dwell progress ring.
- **Mouse Fallback**:
  - Left-Click and drag = Point to Draw.
  - Right-Click and drag (or Shift + Click) = Erase.
- **1€ (One Euro) Filter**:
  - Adaptive low-pass filter ($\text{minCutoff} = 1.0\text{ Hz}, \beta = 0.02$) prevents jitter while keeping low latency.
- **Lost Hand Immunity**:
  - Dropouts under 150 ms are ignored to prevent accidental stroke interruption.
- **Debug Overlay**:
  - Press <kbd>D</kbd> at any time during gameplay to toggle the live gesture debug overlay.

---

## Testing

A Node test suite is included in `tests/recognise.test.mjs` verifying shape recognition, 0°/90° axial line snapping (within 8° tolerance), and Chaikin curve smoothing:
```bash
node --test tests/recognise.test.mjs
```
