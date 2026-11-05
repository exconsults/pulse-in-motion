import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BodyCanvas } from "@/components/BodyCanvas";
import { AudioEngine } from "@/lib/audio-engine";
import { BrowserPulse } from "@/lib/browser-pulse";
import { fromPresagePayload, moodLabel, stressScore, type SignalSource, type Vitals } from "@/lib/signals";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Resonance — music & art that feels your heartbeat" },
      { name: "description", content: "A living soundscape and generative artwork driven by your pulse, breathing and HRV via the Presage SmartSpectra SDK." },
      { property: "og:title", content: "Resonance — music & art that feels your heartbeat" },
      { property: "og:description", content: "Your camera reads your pulse, breath and HRV. The art and music respond in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const BRIDGE_URL = "ws://localhost:8787";

function Index() {
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<SignalSource>("idle");
  const [vitals, setVitals] = useState<Vitals>({ t: 0 });
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audio = useRef<AudioEngine | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const score = stressScore(vitals);
  const stress = score ?? 0.3;

  useEffect(() => {
    audio.current?.update(stress, vitals.pulse);
  }, [stress, vitals.pulse]);

  useEffect(() => () => { cleanup.current(); audio.current?.close(); }, []);

  async function begin() {
    setError(null);
    audio.current = new AudioEngine();
    await audio.current.start();
    setRunning(true);

    // Prefer the Presage SmartSpectra bridge; fall back to the browser estimate.
    let bridged = false;
    const ws = new WebSocket(BRIDGE_URL);
    const timeout = setTimeout(() => ws.close(), 1500);
    ws.onopen = () => {
      clearTimeout(timeout);
      bridged = true;
      setSource("presage");
      cleanup.current = () => ws.close();
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "metrics") {
        const v = fromPresagePayload(msg.metrics);
        setVitals((p) => ({ ...p, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x != null)), t: Date.now() }));
      } else if (msg.type === "hint") {
        setVitals((p) => ({ ...p, hint: msg.hint || undefined }));
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (bridged) setSource("idle");
      else void startBrowser();
    };
  }

  async function startBrowser() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      const est = new BrowserPulse(v, (pulse, breathing) =>
        setVitals((p) => ({ ...p, pulse, breathing, t: Date.now() })),
      );
      est.start();
      setSource("browser");
      cleanup.current = () => { est.stop(); stream.getTracks().forEach((t) => t.stop()); };
    } catch (e) {
      console.error("camera", e);
      setError("Camera access was blocked. Allow the camera to let the piece hear you.");
    }
  }

  function stop() {
    cleanup.current();
    audio.current?.close();
    audio.current = null;
    setRunning(false);
    setSource("idle");
    setVitals({ t: 0 });
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <BodyCanvas stress={stress} bpm={vitals.pulse ?? 64} breathing={vitals.breathing ?? 12} />
      <video ref={videoRef} muted playsInline className="camera-thumb" />

      <div className="relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Presage SmartSpectra · Human-sensing</p>
            <h1 className="font-display text-4xl md:text-6xl">Resonance</h1>
          </div>
          {running && (
            <div className="flex gap-2">
              <button className="chip" onClick={() => { setMuted(!muted); audio.current?.setMuted(!muted); }}>
                {muted ? "Unmute" : "Mute"}
              </button>
              <button className="chip" onClick={stop}>End</button>
            </div>
          )}
        </header>

        {!running ? (
          <section className="mx-auto max-w-xl text-center">
            <p className="font-display text-2xl leading-snug md:text-3xl">
              Your heartbeat becomes the rhythm. Your breath, the tide. Your stress, the colour.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Sit still, face the camera in good light, and wear headphones.
            </p>
            <button className="cta mt-8" onClick={begin}>Begin listening</button>
          </section>
        ) : (
          <section className="text-center">
            <p className="eyebrow">{source === "presage" ? "Live from SmartSpectra" : source === "browser" ? "Browser estimate (start the Presage bridge for full accuracy)" : "Connecting…"}</p>
            <p className="font-display mt-2 text-5xl md:text-7xl">{moodLabel(score)}</p>
            {vitals.hint && <p className="mt-3 text-sm text-muted-foreground">{vitals.hint}</p>}
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </section>
        )}

        <footer className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Pulse" value={vitals.pulse} unit="bpm" />
          <Stat label="Breathing" value={vitals.breathing} unit="/min" />
          <Stat label="HRV" value={vitals.hrv} unit="ms" />
          <Stat label="Arousal" value={score === null ? undefined : Math.round(score * 100)} unit="%" />
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value, unit }: { label: string; value?: number | undefined; unit: string }) {
  return (
    <div className="stat">
      <p className="eyebrow">{label}</p>
      <p className="font-mono text-2xl">
        {value != null && Number.isFinite(value) ? Math.round(value) : "—"}
        <span className="ml-1 text-xs text-muted-foreground">{unit}</span>
      </p>
    </div>
  );
}
