/* ---------- Screen 2: STORY (Typewriter Artisan Heritage Lore) ---------- */

export const STORY_LINES = [
  "For centuries, in the foothills of the Sahyadri mountains,",
  "our ancestors ground fresh rice into white paste to paint upon red mud walls.",
  "You carry the hands of this proud artisan lineage.",
  "Every line you draw is a prayer of harmony between nature and spirit:",
  "the sacred circle of the sun, the tarpa horn calling dancers to hold hands,",
  "and the shelter of the earthen hut.",
  "Today, the village canvas awaits your vision."
];

export class StoryScreen {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.currentLineIndex = 0;
    this.currentCharIndex = 0;
    this.textContainer = null;
    this.beginBtn = null;
    this.skipStoryBtn = null;
    this.typewriterTimer = null;
    this.isDone = false;
  }

  enter() {
    this.currentLineIndex = 0;
    this.currentCharIndex = 0;
    this.isDone = false;

    this.container = document.createElement("div");
    this.container.id = "screen-story";
    this.container.className = "screen-overlay active";

    this.container.innerHTML = `
      <div class="story-wrapper">
        <div class="story-artisan-seal">✦ वारली कला ✦</div>
        <div class="story-content" id="storyText"></div>
        <div class="story-actions">
          <button id="storyBeginBtn" class="btn primary" style="opacity: 0; pointer-events: none;">Begin Your Craft ➔</button>
          <button id="storySkipBtn" class="btn text-btn">Skip Narration</button>
        </div>
      </div>
    `;

    document.getElementById("screen-container").appendChild(this.container);

    this.textContainer = this.container.querySelector("#storyText");
    this.beginBtn = this.container.querySelector("#storyBeginBtn");
    this.skipStoryBtn = this.container.querySelector("#storySkipBtn");

    this.beginBtn.addEventListener("click", () => this.proceed());
    this.skipStoryBtn.addEventListener("click", () => this.showAllAndEnable());

    // Register begin button as dwellable / pinchable target
    this.app.registerInteractiveTarget("storyBeginBtn", () => this.proceed(), this.beginBtn);

    const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      this.showAllAndEnable();
    } else {
      this.startTypingLine();
    }
  }

  startTypingLine() {
    if (this.currentLineIndex >= STORY_LINES.length) {
      this.finishTyping();
      return;
    }

    const lineP = document.createElement("p");
    lineP.className = "story-line";
    this.textContainer.appendChild(lineP);

    const lineText = STORY_LINES[this.currentLineIndex];
    this.currentCharIndex = 0;

    const typeChar = () => {
      if (this.isDone) return;
      if (this.currentCharIndex < lineText.length) {
        lineP.textContent += lineText[this.currentCharIndex];
        this.currentCharIndex++;
        this.typewriterTimer = setTimeout(typeChar, 28);
      } else {
        this.currentLineIndex++;
        this.typewriterTimer = setTimeout(() => this.startTypingLine(), 450);
      }
    };

    typeChar();
  }

  showAllAndEnable() {
    clearTimeout(this.typewriterTimer);
    this.textContainer.innerHTML = "";
    STORY_LINES.forEach((line) => {
      const p = document.createElement("p");
      p.className = "story-line completed";
      p.textContent = line;
      this.textContainer.appendChild(p);
    });
    this.finishTyping();
  }

  finishTyping() {
    this.isDone = true;
    if (this.beginBtn) {
      this.beginBtn.style.opacity = "1";
      this.beginBtn.style.pointerEvents = "auto";
      this.beginBtn.focus();
    }
    if (this.skipStoryBtn) {
      this.skipStoryBtn.style.display = "none";
    }
  }

  proceed() {
    this.app.goToScreen("CANVAS_SELECT");
  }

  exit() {
    clearTimeout(this.typewriterTimer);
    this.app.unregisterInteractiveTarget("storyBeginBtn");
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  update(now) {
    // Check if cursor hover/dwell is over begin button
    if (this.isDone && this.beginBtn) {
      this.app.checkDwellForElement("storyBeginBtn", this.beginBtn, now);
    }
  }

  render(ctx) {}
}
