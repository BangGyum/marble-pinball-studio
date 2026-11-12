export class RenderResolution {
  private cap = 2;
  private elapsed = 0;
  private frames = 0;
  private stable = 0;

  ratio(deviceRatio: number) {
    return Math.min(deviceRatio, this.cap);
  }

  sample(milliseconds: number, active: boolean, deviceRatio: number) {
    if (!active || milliseconds <= 0 || milliseconds > 100) {
      this.elapsed = this.frames = this.stable = 0;
      return false;
    }
    this.elapsed += milliseconds;
    this.frames++;
    if (this.elapsed < 1000) return false;
    const interval = this.elapsed / this.frames,
      previous = this.cap;
    if (interval > 17.5 && this.ratio(deviceRatio) > 1) {
      this.cap = Math.max(1, this.ratio(deviceRatio) - 0.25);
      this.stable = 0;
    } else if (interval < 17) {
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
