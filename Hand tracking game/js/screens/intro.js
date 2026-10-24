/* ---------- Screen 1: INTRO (Video Intro & Camera Permission Gesture) ---------- */

export class IntroScreen {
  constructor(app) {
    this.app = app;
    this.videoElement = null;
    this.container = null;
    this.hasSkipped = false;
  }

  enter() {
    this.hasSkipped = false;
    this.container = document.createElement("div");
    this.container.id = "screen-intro";
    this.container.className = "screen-overlay active";

    this.container.innerHTML = `
      <div class="intro-backdrop">
        <video id="introVideo" playsinline preload="auto" class="intro-video" style="display:none;"></video>
        <div class="intro-card" id="introCard">
          <div class="badge">A Warli Heritage Experience</div>
          <h1 class="artisan-title">Mohalla</h1>
          <p class="lede">Paint living Warli folk stories with authentic hand gestures or mouse.</p>
          <ul class="intro-features">
            <li><strong>Index Finger Pointing</strong>: Extend your index finger to draw rice-paste white strokes</li>
            <li><strong>Two Fingers Together</strong>: Hold index and middle fingers together side-by-side to erase</li>
            <li><strong>Living Folklore</strong>: Geometric stamps of tarpa dancers, huts, sacred trees & peacocks</li>
            <li><strong>Guided Tracing</strong>: Magnetic alignment creates clean, gallery-worthy artisan art</li>
          </ul>
          <div class="actions">
            <button id="introStartCam" class="btn primary">Start with Camera</button>
            <button id="introStartMouse" class="btn secondary">Play with Mouse</button>
          </div>
          <p id="introStatus" class="status-text" role="status"></p>
        </div>
        <button id="introSkipBtn" class="btn text-btn skip-btn" style="display:none;">Skip Video ➔</button>
      </div>
    `;

    document.getElementById("screen-container").appendChild(this.container);

    this.videoElement = this.container.querySelector("#introVideo");
    const startCamBtn = this.container.querySelector("#introStartCam");
    const startMouseBtn = this.container.querySelector("#introStartMouse");
    const skipBtn = this.container.querySelector("#introSkipBtn");
    const statusText = this.container.querySelector("#introStatus");

    // Camera initiation (User Gesture)
    startCamBtn.addEventListener("click", async () => {
      startCamBtn.disabled = true;
      startMouseBtn.disabled = true;
      statusText.textContent = "Connecting camera and loading hand tracking model…";

      try {
        await this.app.initHandTracking();
        statusText.textContent = "Ready!";
        this.playVideoOrProceed();
      } catch (err) {
        console.warn("Camera start failed, falling back to mouse", err);
        statusText.textContent = "Camera unavailable. Switching to mouse mode…";
        setTimeout(() => {
          this.app.useMouse = true;
          this.playVideoOrProceed();
        }, 1200);
      }
    });

    // Mouse fallback initiation
    startMouseBtn.addEventListener("click", () => {
      this.app.useMouse = true;
      this.playVideoOrProceed();
    });

    // Skip button
    skipBtn.addEventListener("click", () => {
      this.proceedToStory();
    });
  }

  playVideoOrProceed() {
    const card = this.container.querySelector("#introCard");
    const skipBtn = this.container.querySelector("#introSkipBtn");

    if (card) card.style.display = "none";
    if (skipBtn) skipBtn.style.display = "block";

    // Attempt to load and play assets/intro.mp4
    this.videoElement.src = "assets/intro.mp4";
    this.videoElement.style.display = "block";

    const onFinish = () => {
      this.proceedToStory();
    };

    this.videoElement.addEventListener("ended", onFinish, { once: true });
    this.videoElement.addEventListener("error", () => {
      console.log("assets/intro.mp4 not present or failed to play, proceeding directly to story.");
      onFinish();
    }, { once: true });

    const playPromise = this.videoElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.log("Video autoplay prevented or file missing, continuing directly.", err);
        onFinish();
      });
    }
  }

  proceedToStory() {
    if (this.hasSkipped) return;
    this.hasSkipped = true;
    if (this.videoElement) {
      try { this.videoElement.pause(); } catch (e) {}
    }
    this.app.goToScreen("STORY");
  }

  exit() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  update(now) {}
  render(ctx) {}
}
