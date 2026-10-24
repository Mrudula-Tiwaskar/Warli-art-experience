// 1 Euro Filter for smooth, low-latency tracking of noisy 2D coordinates (pinch point)
// Casiez et al., CHI 2012: "1 € Filter: A Simple Speed-based Low-pass Filter for Noisy Input in HCI"

class LowPassFilter {
  constructor(alpha = 0.5, initVal = 0) {
    this.alpha = alpha;
    this.s = initVal;
    this.initialized = false;
  }

  filter(val, alpha = this.alpha) {
    if (!this.initialized) {
      this.s = val;
      this.initialized = true;
      return val;
    }
    this.s = alpha * val + (1 - alpha) * this.s;
    return this.s;
  }

  hasLast() {
    return this.initialized;
  }

  last() {
    return this.s;
  }

  reset() {
    this.initialized = false;
  }
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.lastTime = null;
  }

  alpha(rate, cutoff) {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    const te = 1.0 / Math.max(1e-5, rate);
    return 1.0 / (1.0 + tau / te);
  }

  filter(val, timestampSec) {
    if (this.lastTime === null) {
      this.lastTime = timestampSec;
      return this.xFilter.filter(val);
    }

    const dt = Math.max(1e-4, timestampSec - this.lastTime);
    this.lastTime = timestampSec;
    const rate = 1.0 / dt;

    const prevX = this.xFilter.hasLast() ? this.xFilter.last() : val;
    const dx = (val - prevX) * rate;
    const edx = this.dxFilter.filter(dx, this.alpha(rate, this.dCutoff));

    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.xFilter.filter(val, this.alpha(rate, cutoff));
  }

  reset() {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = null;
  }
}

export class PointOneEuroFilter {
  constructor(options = { minCutoff: 1.0, beta: 0.02, dCutoff: 1.0 }) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
  }

  setParams(minCutoff, beta) {
    this.fx.minCutoff = minCutoff;
    this.fy.minCutoff = minCutoff;
    this.fx.beta = beta;
    this.fy.beta = beta;
  }

  filter(x, y, timestampSec) {
    return {
      x: this.fx.filter(x, timestampSec),
      y: this.fy.filter(y, timestampSec)
    };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
