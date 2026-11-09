/** Session-relative microseconds; never compress real gaps into invented time. */
export class FrameClock {
  constructor() {
    this.lastReal = null;
    this.timestamp = 0;
  }

  next(nowMs) {
    if (!Number.isFinite(nowMs)) return null;
    const elapsedMs = this.lastReal === null ? 66 : nowMs - this.lastReal;
    if (elapsedMs < 0 || elapsedMs > 2000) return null;
    this.lastReal = nowMs;
    this.timestamp += Math.max(1, Math.round(elapsedMs * 1000));
    return this.timestamp;
  }
}