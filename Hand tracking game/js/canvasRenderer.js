/* ---------- Canvas Renderers: Mud Wall, Painting Frame, and Saadi ---------- */

export const CANVAS_TYPES = {
  WALL: "wall",
  FRAME: "frame",
  SAADI: "saadi"
};

export const SAADI_COLORS = [
  { id: "maroon", name: "Deep Maroon", base: "#6b1420", dark: "#4a0a13", border: "#fbf3e4" },
  { id: "indigo", name: "Royal Indigo", base: "#1a2c54", dark: "#0f1b36", border: "#fbf3e4" },
  { id: "mustard", name: "Kasturi Mustard", base: "#8c5e0d", dark: "#5e3e06", border: "#fbf3e4" }
];

export class CanvasRenderer {
  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;
    this.cache = new Map();
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
    this.cache.clear();
  }

  // Paint color suited to current canvas
  getPaintColor(canvasType) {
    if (canvasType === CANVAS_TYPES.FRAME) {
      return "#5c2112"; // dark red-ochre on cream paper
    }
    return "#fbf3e4"; // rice-paste white
  }

  // Mud Wall Background
  renderWall() {
    const key = `wall_${this.width}_${this.height}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const g = c.getContext("2d");

    const grad = g.createRadialGradient(
      this.width / 2, this.height / 2, this.height * 0.15,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.75
    );
    grad.addColorStop(0, "#ba5931");
    grad.addColorStop(0.7, "#8a3f22");
    grad.addColorStop(1, "#54210e");
    g.fillStyle = grad;
    g.fillRect(0, 0, this.width, this.height);

    // Mud grain & mineral specks
    for (let i = 0; i < 9000; i++) {
      const s = Math.random() * 2.2 + 0.5;
      g.fillStyle = Math.random() < 0.5 ? "rgba(30, 10, 5, 0.14)" : "rgba(255, 230, 195, 0.08)";
      g.fillRect(Math.random() * this.width, Math.random() * this.height, s, s);
    }

    this.cache.set(key, c);
    return c;
  }

  // Framed Handmade Paper Canvas
  renderFrame() {
    const key = `frame_${this.width}_${this.height}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const g = c.getContext("2d");

    // Ambient room wall backdrop
    const roomGrad = g.createLinearGradient(0, 0, 0, this.height);
    roomGrad.addColorStop(0, "#2c2623");
    roomGrad.addColorStop(1, "#181412");
    g.fillStyle = roomGrad;
    g.fillRect(0, 0, this.width, this.height);

    // Frame dimensions
    const padX = this.width * 0.08;
    const padY = this.height * 0.08;
    const fw = this.width - padX * 2;
    const fh = this.height - padY * 2;
    const border = 24;

    // Drop shadow behind wood frame
    g.save();
    g.shadowColor = "rgba(0, 0, 0, 0.65)";
    g.shadowBlur = 32;
    g.shadowOffsetY = 14;

    // Wooden frame outer body
    const woodGrad = g.createLinearGradient(padX, padY, padX + fw, padY + fh);
    woodGrad.addColorStop(0, "#4a2612");
    woodGrad.addColorStop(0.5, "#2f1709");
    woodGrad.addColorStop(1, "#44210e");
    g.fillStyle = woodGrad;
    g.fillRect(padX, padY, fw, fh);
    g.restore();

    // Inner gold/brass bevel fillet
    g.strokeStyle = "rgba(218, 165, 32, 0.5)";
    g.lineWidth = 3;
    g.strokeRect(padX + border - 2, padY + border - 2, fw - (border - 2) * 2, fh - (border - 2) * 2);

    // Handmade paper canvas area
    const px = padX + border;
    const py = padY + border;
    const pw = fw - border * 2;
    const ph = fh - border * 2;

    const paperGrad = g.createRadialGradient(
      px + pw / 2, py + ph / 2, ph * 0.2,
      px + pw / 2, py + ph / 2, Math.max(pw, ph) * 0.7
    );
    paperGrad.addColorStop(0, "#faf3e8");
    paperGrad.addColorStop(0.8, "#f1e5d3");
    paperGrad.addColorStop(1, "#e6d5bd");
    g.fillStyle = paperGrad;
    g.fillRect(px, py, pw, ph);

    // Fibrous texture of handmade paper
    for (let i = 0; i < 7000; i++) {
      const s = Math.random() * 2 + 0.5;
      g.fillStyle = Math.random() < 0.6 ? "rgba(100, 75, 45, 0.05)" : "rgba(255, 255, 255, 0.12)";
      g.fillRect(px + Math.random() * pw, py + Math.random() * ph, s, s);
    }

    this.cache.set(key, c);
    return c;
  }

  // Saadi / Saree Fabric with Border and Pallu
  renderSaadi(colorIndex = 0) {
    const col = SAADI_COLORS[colorIndex % SAADI_COLORS.length];
    const key = `saadi_${col.id}_${this.width}_${this.height}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const g = c.getContext("2d");

    // Saree field gradient
    const silkGrad = g.createLinearGradient(0, 0, this.width, this.height);
    silkGrad.addColorStop(0, col.base);
    silkGrad.addColorStop(0.5, col.dark);
    silkGrad.addColorStop(1, col.base);
    g.fillStyle = silkGrad;
    g.fillRect(0, 0, this.width, this.height);

    // Micro silk weave sheen
    for (let y = 0; y < this.height; y += 4) {
      g.fillStyle = "rgba(255, 255, 255, 0.02)";
      g.fillRect(0, y, this.width, 1.5);
    }

    // Top and Bottom decorative borders
    const borderHeight = 60;
    this.drawSaadiBorder(g, 0, 0, this.width, borderHeight, false);
    this.drawSaadiBorder(g, 0, this.height - borderHeight, this.width, borderHeight, true);

    // Right Pallu area (25% of width)
    const palluX = this.width * 0.76;
    const palluW = this.width - palluX;

    g.fillStyle = "rgba(0, 0, 0, 0.15)";
    g.fillRect(palluX, borderHeight, palluW, this.height - borderHeight * 2);

    // Vertical separator border between body and pallu
    this.drawVerticalBorder(g, palluX, borderHeight, 40, this.height - borderHeight * 2);

    // Pallu fringe / tassels along extreme right
    for (let y = borderHeight; y <= this.height - borderHeight; y += 12) {
      g.strokeStyle = "#ffd27a";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(this.width - 14, y);
      g.lineTo(this.width, y + (Math.sin(y) * 4));
      g.stroke();
    }

    this.cache.set(key, c);
    return c;
  }

  drawSaadiBorder(g, x, y, w, h, isBottom) {
    g.save();
    g.fillStyle = "rgba(0, 0, 0, 0.35)";
    g.fillRect(x, y, w, h);

    // Golden boundary threads
    g.strokeStyle = "#ffd27a";
    g.lineWidth = 2;
    const lineY = isBottom ? y + 4 : y + h - 4;
    g.beginPath();
    g.moveTo(x, lineY);
    g.lineTo(x + w, lineY);
    g.stroke();

    // Geometric Warli chevron / triangle motif across border
    g.fillStyle = "#fbf3e4";
    const triWidth = 18;
    const count = Math.ceil(w / triWidth);
    const midY = y + h / 2;

    for (let i = 0; i < count; i++) {
      const bx = x + i * triWidth;
      g.beginPath();
      if (!isBottom) {
        g.moveTo(bx, y + 10);
        g.lineTo(bx + triWidth, y + 10);
        g.lineTo(bx + triWidth / 2, midY + 8);
      } else {
        g.moveTo(bx, y + h - 10);
        g.lineTo(bx + triWidth, y + h - 10);
        g.lineTo(bx + triWidth / 2, midY - 8);
      }
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  drawVerticalBorder(g, x, y, w, h) {
    g.save();
    g.fillStyle = "rgba(0, 0, 0, 0.25)";
    g.fillRect(x, y, w, h);

    g.strokeStyle = "#ffd27a";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x + 2, y);
    g.lineTo(x + 2, y + h);
    g.moveTo(x + w - 2, y);
    g.lineTo(x + w - 2, y + h);
    g.stroke();

    // Repeating diamond motif
    g.fillStyle = "#fbf3e4";
    const dH = 20;
    const count = Math.ceil(h / dH);
    for (let i = 0; i < count; i++) {
      const cy = y + i * dH + dH / 2;
      const cx = x + w / 2;
      g.beginPath();
      g.moveTo(cx, cy - 7);
      g.lineTo(cx + 8, cy);
      g.lineTo(cx, cy + 7);
      g.lineTo(cx - 8, cy);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  drawBackground(ctx, canvasType, saadiColorIndex = 0) {
    let img;
    if (canvasType === CANVAS_TYPES.FRAME) {
      img = this.renderFrame();
    } else if (canvasType === CANVAS_TYPES.SAADI) {
      img = this.renderSaadi(saadiColorIndex);
    } else {
      img = this.renderWall();
    }
    ctx.drawImage(img, 0, 0, this.width, this.height);
  }
}
