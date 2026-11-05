/**
 * Lightweight in-browser fallback: estimates pulse from forehead/cheek colour
 * changes (green channel). Used only when the Presage bridge isn't running.
 */
export class BrowserPulse {
  private samples: { t: number; g: number }[] = [];
  private raf = 0;
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d", { willReadFrequently: true })!;

  constructor(
    private video: HTMLVideoElement,
    private onPulse: (bpm: number | undefined, breathing: number | undefined) => void,
  ) {
    this.canvas.width = 64;
    this.canvas.height = 48;
  }

  start() {
    let lastEmit = 0;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.video.readyState < 2) return;
      const vw = this.video.videoWidth, vh = this.video.videoHeight;
      // centre-upper region where a face usually sits
      this.ctx.drawImage(this.video, vw * 0.35, vh * 0.2, vw * 0.3, vh * 0.3, 0, 0, 64, 48);
      const d = this.ctx.getImageData(0, 0, 64, 48).data;
      let g = 0;
      for (let i = 1; i < d.length; i += 4) g += d[i]!;
      const now = performance.now();
      this.samples.push({ t: now, g: g / (d.length / 4) });
      while (this.samples.length && now - this.samples[0]!.t > 12000) this.samples.shift();
      if (now - lastEmit > 1000 && this.samples.length > 150) {
        lastEmit = now;
        this.onPulse(this.dominant(0.75, 3), this.dominant(0.15, 0.5));
      }
    };
    loop();
  }

  /** Strongest frequency (per minute) between lo and hi Hz. */
  private dominant(lo: number, hi: number) {
    const s = this.samples;
    const dur = (s[s.length - 1]!.t - s[0]!.t) / 1000;
    if (dur < 8) return undefined;
    const mean = s.reduce((a, b) => a + b.g, 0) / s.length;
    let best = 0, bestF = 0;
    for (let f = lo; f <= hi; f += 0.01) {
      let re = 0, im = 0;
      for (const p of s) {
        const ph = 2 * Math.PI * f * (p.t / 1000);
        re += (p.g - mean) * Math.cos(ph);
        im += (p.g - mean) * Math.sin(ph);
      }
      const pow = re * re + im * im;
      if (pow > best) { best = pow; bestF = f; }
    }
    return Math.round(bestF * 60);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}
