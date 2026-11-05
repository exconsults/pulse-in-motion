import { describe, expect, it } from "vitest";
import { fromPresagePayload, stressScore } from "@/lib/signals";

describe("stressScore", () => {
  it("is calm (0) at resting pulse, slow breath, high HRV", () => {
    expect(stressScore({ pulse: 60, breathing: 10, hrv: 80 })).toBe(0);
  });
  it("is maximal (1) at fast pulse, fast breath, low HRV", () => {
    expect(stressScore({ pulse: 110, breathing: 25, hrv: 15 })).toBe(1);
  });
  it("returns null with no signals", () => {
    expect(stressScore({})).toBeNull();
  });
});

describe("fromPresagePayload", () => {
  it("reads the latest pulse, breathing and HRV", () => {
    const v = fromPresagePayload({
      cardio: { pulseRate: [{ value: 70 }, { value: 72 }], hrv: [{ rmssd: 41 }] },
      breathing: { rate: [{ value: 14 }] },
    });
    expect(v).toMatchObject({ pulse: 72, breathing: 14, hrv: 41 });
  });
});
