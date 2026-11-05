export type SignalSource = "presage" | "browser" | "idle";

export interface Vitals {
  pulse?: number | undefined; // beats per minute
  breathing?: number | undefined; // breaths per minute
  hrv?: number | undefined; // RMSSD in ms
  breathTrace?: number | undefined; // latest chest trace sample
  expression?: string | undefined;
  hint?: string | undefined;
  t: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const norm = (v: number, lo: number, hi: number) => clamp01((v - lo) / (hi - lo));

/**
 * Arousal score 0 (calm) .. 1 (stressed).
 * Pulse 60→110 bpm, breathing 10→25 /min, HRV RMSSD 80→15 ms (lower HRV = more stress).
 * Only the signals present contribute; returns null when none are available.
 */
export function stressScore(v: Partial<Vitals>): number | null {
  const parts: Array<[number, number]> = [];
  if (v.pulse && v.pulse > 0) parts.push([norm(v.pulse, 60, 110), 0.4]);
  if (v.breathing && v.breathing > 0) parts.push([norm(v.breathing, 10, 25), 0.3]);
  if (v.hrv && v.hrv > 0) parts.push([1 - norm(v.hrv, 15, 80), 0.3]);
  if (!parts.length) return null;
  const w = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [x, wt]) => s + x * wt, 0) / w;
}

export function moodLabel(score: number | null): string {
  if (score === null) return "Listening…";
  if (score < 0.25) return "Deep calm";
  if (score < 0.45) return "Settled";
  if (score < 0.65) return "Alert";
  if (score < 0.8) return "Tense";
  return "Overdrive";
}

/** Extract the values the experience uses from a decoded SmartSpectra metrics payload. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromPresagePayload(m: any): Partial<Vitals> {
  const last = (a: unknown) => (Array.isArray(a) && a.length ? a[a.length - 1] : undefined);
  const expr = last(m?.face?.expression);
  return {
    pulse: last(m?.cardio?.pulseRate)?.value,
    breathing: last(m?.breathing?.rate)?.value,
    hrv: last(m?.cardio?.hrv)?.rmssd,
    breathTrace: last(m?.breathing?.upperTrace)?.value,
    expression: typeof expr === "string" ? expr : expr?.label ?? expr?.name,
  };
}
