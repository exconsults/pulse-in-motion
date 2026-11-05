/**
 * In-browser face landmarks (MediaPipe Face Landmarker). Loaded lazily on the
 * client only. Gives landmark points for the overlay, a forehead box for the
 * pulse estimate, and a simple expression label from blendshapes.
 */
export type Point = { x: number; y: number };
export interface FaceFrame {
  points: Point[] | null; // normalized 0..1, null when no face
  expression?: string | undefined;
  forehead?: { x: number; y: number; w: number; h: number } | undefined;
}

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function expressionFrom(scores: Record<string, number>): string {
  const g = (k: string) => scores[k] ?? 0;
  const smile = (g("mouthSmileLeft") + g("mouthSmileRight")) / 2;
  const brow = (g("browDownLeft") + g("browDownRight")) / 2;
  if (smile > 0.45) return "Happy";
  if (g("jawOpen") > 0.5 && g("browInnerUp") > 0.4) return "Surprised";
  if (brow > 0.4) return "Tense";
  if (g("eyeBlinkLeft") > 0.6 && g("eyeBlinkRight") > 0.6) return "Relaxed";
  if (smile > 0.15) return "Content";
  return "Neutral";
}

export async function createFaceTracker(video: HTMLVideoElement, onFrame: (f: FaceFrame) => void) {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WASM);
  const make = (delegate: "GPU" | "CPU") =>
    FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
    });
  const lm = await make("GPU").catch(() => make("CPU"));

  let raf = 0, lastT = -1, stopped = false;
  const loop = () => {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    if (video.readyState < 2 || video.currentTime === lastT) return;
    lastT = video.currentTime;
    const r = lm.detectForVideo(video, performance.now());
    const pts = r.faceLandmarks?.[0];
    if (!pts?.length) return onFrame({ points: null });
    const scores: Record<string, number> = {};
    for (const c of r.faceBlendshapes?.[0]?.categories ?? []) scores[c.categoryName] = c.score;
    // forehead: between brows (landmarks 105/334) and hairline (10)
    const top = pts[10]!, l = pts[105]!, rr = pts[334]!;
    const x = Math.min(l.x, rr.x), w = Math.abs(rr.x - l.x), y = top.y, h = Math.max(0.02, Math.min(l.y, rr.y) - top.y);
    onFrame({ points: pts.map((p) => ({ x: p.x, y: p.y })), expression: expressionFrom(scores), forehead: { x, y, w, h } });
  };
  loop();
  return () => { stopped = true; cancelAnimationFrame(raf); lm.close(); };
}
