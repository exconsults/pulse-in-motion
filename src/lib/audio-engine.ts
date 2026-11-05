/** Generative ambient score that follows the listener's body. */
const CALM = [0, 4, 7, 11, 14]; // major 7 / 9
const TENSE = [0, 3, 6, 10, 13]; // half-diminished, b9

export class AudioEngine {
  private ctx = new AudioContext();
  private master = this.ctx.createGain();
  private filter = this.ctx.createBiquadFilter();
  private pad: OscillatorNode[] = [];
  private padGains: GainNode[] = [];
  private stress = 0.3;
  private bpm = 70;
  private beatTimer = 0;
  private nextBeat = 0;

  constructor() {
    this.filter.type = "lowpass";
    this.filter.frequency.value = 900;
    this.master.gain.value = 0;
    const delay = this.ctx.createDelay();
    delay.delayTime.value = 0.38;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.35;
    this.filter.connect(this.master);
    this.filter.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.master);
    this.master.connect(this.ctx.destination);

    for (let i = 0; i < 5; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = i % 2 ? "triangle" : "sine";
      g.gain.value = 0.05;
      o.connect(g).connect(this.filter);
      o.start();
      this.pad.push(o);
      this.padGains.push(g);
    }
    this.retune();
  }

  async start() {
    await this.ctx.resume();
    this.master.gain.setTargetAtTime(0.6, this.ctx.currentTime, 1.5);
    this.nextBeat = this.ctx.currentTime + 0.2;
    this.beatTimer = window.setInterval(() => this.schedule(), 50);
  }

  update(stress: number, bpm?: number) {
    this.stress = stress;
    if (bpm && bpm > 35 && bpm < 180) this.bpm = bpm;
    this.retune();
  }

  private retune() {
    const t = this.ctx.currentTime;
    const root = 110 * Math.pow(2, (this.stress * 3) / 12);
    for (let i = 0; i < this.pad.length; i++) {
      const c = CALM[i]!, k = TENSE[i]!, o = this.pad[i]!;
      const semis = c + (k - c) * this.stress;
      o.frequency.setTargetAtTime(root * Math.pow(2, semis / 12), t, 2);
      o.detune.setTargetAtTime(this.stress * 18 * (i % 2 ? 1 : -1), t, 2);
    }
    this.filter.frequency.setTargetAtTime(500 + this.stress * 2600, t, 1.5);
    this.filter.Q.setTargetAtTime(1 + this.stress * 8, t, 1.5);
  }

  /** A soft heartbeat pulse at the listener's own heart rate. */
  private schedule() {
    while (this.nextBeat < this.ctx.currentTime + 0.2) {
      this.thump(this.nextBeat, 1);
      this.thump(this.nextBeat + 0.18, 0.55);
      this.nextBeat += 60 / this.bpm;
    }
  }

  private thump(at: number, vel: number) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(70 + this.stress * 30, at);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.15);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.35 * vel, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + 0.3);
  }

  setMuted(m: boolean) {
    this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.3);
  }

  close() {
    clearInterval(this.beatTimer);
    this.ctx.close();
  }
}
