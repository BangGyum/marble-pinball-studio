export class RenderResolution {
  private cap = 2;
  private elapsed = 0;
  private frames = 0;
  private stable = 0;
  private idleInterval = 0;
  private calibrating = false;

  ratio(deviceRatio: number) {
    return Math.min(deviceRatio, this.cap);
  }

  sample(milliseconds: number, active: boolean, deviceRatio: number, settled = false) {
    if ((!active && !settled) || milliseconds <= 0 || milliseconds > 100) {
      this.elapsed = this.frames = this.stable = 0;
      return false;
    }
    const calibrating = !active;
    if (calibrating !== this.calibrating) this.elapsed = this.frames = this.stable = 0;
    this.calibrating = calibrating;
    this.elapsed += milliseconds;
    this.frames++;
    if (this.elapsed < 1000) return false;
    const interval = this.elapsed / this.frames,
      previous = this.cap;
    if (calibrating) {
      // Compare game load with this browser's idle cadence, not an assumed 60Hz signal.
      this.idleInterval = interval;
    } else if (interval > Math.max(17.5, this.idleInterval * 1.1) && this.ratio(deviceRatio) > 1) {
      this.cap = Math.max(1, this.ratio(deviceRatio) - 0.25);
      this.stable = 0;
    } else if (interval < Math.max(17, this.idleInterval * 1.03)) {
      this.stable += this.elapsed;
      if (this.stable >= 15000) {
        this.cap = Math.min(2, this.cap + 0.25);
        this.stable = 0;
      }
    } else this.stable = 0;
    this.elapsed = this.frames = 0;
    return this.cap !== previous;
  }
}
