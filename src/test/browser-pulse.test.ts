import { afterEach, expect, it, vi } from "vitest";
import { BrowserPulse } from "@/lib/browser-pulse";

afterEach(() => vi.restoreAllMocks());

it("does not sample camera colours or report vitals without a detected face", () => {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  const video = document.createElement("video");
  Object.defineProperty(video, "readyState", { value: 4 });
  const onPulse = vi.fn();
  new BrowserPulse(video, onPulse).start();
  expect(drawImage).not.toHaveBeenCalled();
  expect(onPulse).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});