import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AudioEngine } from "@/lib/audio-engine";
import { BrowserPulse } from "@/lib/browser-pulse";
import { createFaceTracker, type Point } from "@/lib/face-tracker";
import { fromPresagePayload, moodLabel, stressScore, type SignalSource, type Vitals } from "@/lib/signals";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CalmPulse — guided breathing that reads your pulse" },
      { name: "description", content: "Box breathing guided by your live pulse, breathing rate and HRV from the Presage SmartSpectra SDK. Camera data stays on your device." },
      { property: "og:title", content: "CalmPulse — guided breathing that reads your pulse" },
      { property: "og:description", content: "Your camera reads pulse, breathing and HRV on-device with Presage SmartSpectra. Breathe, and watch your calm score rise." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const BRIDGE_URL = "ws://localhost:8787";
const PHASES = [
  { label: "Inhale", title: "Breathe in", secs: 4 },
  { label: "Hold", title: "Hold", secs: 4 },
  { label: "Exhale", title: "Breathe out", secs: 6 },
  { label: "Hold", title: "Rest", secs: 4 },
];
const CYCLE = PHASES.reduce((s, p) => s + p.secs, 0);

type Series = { pulse: number[]; breathing: number[]; hrv: number[]; calm: { t: number; v: number }[] };

function Index() {
  const [running, setRunning] = useState(false);
  const [source, setSource] = useState<SignalSource>("idle");
  const [vitals, setVitals] = useState<Vitals>({ t: 0 });
  const [series, setSeries] = useState<Series>({ pulse: [], breathing: [], hrv: [], calm: [] });
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [face, setFace] = useState<"off" | "loading" | "ready" | "noface" | "error">("off");
  const [faceError, setFaceError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Point[] | null>(null);
  const lastSampled = useRef(0);
  const audio = useRef<AudioEngine | null>(null);
  const cleanup = useRef<() => void>(() => {});

  const score = stressScore(vitals);
  const stress = score ?? 0.3;
  const calm = score === null ? null : Math.round((1 - score) * 100);

  useEffect(() => { audio.current?.update(stress, vitals.pulse); }, [stress, vitals.pulse]);
  useEffect(() => () => { cleanup.current(); audio.current?.close(); }, []);

  // Face dot overlay: canvas matches the video box (object-cover) and redraws every frame
  useEffect(() => {
    if (source !== "browser") return;
    const cv = canvasRef.current, v = videoRef.current;
    if (!cv || !v) return;
    const ctx = cv.getContext("2d")!;
    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cv.clientWidth * dpr);
      cv.height = Math.round(cv.clientHeight * dpr);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "oklch(0.85 0.13 175)";
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const pts = pointsRef.current;
      if (!pts || !v.videoWidth) return;
      const s = Math.max(cv.width / v.videoWidth, cv.height / v.videoHeight);
      const ox = (cv.width - v.videoWidth * s) / 2, oy = (cv.height - v.videoHeight * s) / 2;
      const r = Math.max(1, (window.devicePixelRatio || 1) * 1.1);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      for (const p of pts) {
        const x = ox + p.x * v.videoWidth * s, y = oy + p.y * v.videoHeight * s;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    };
    draw();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [source]);

  // Breathing guide clock (starts once a live signal source is connected)
  useEffect(() => {
    if (!running || paused || source === "idle") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setElapsed((e) => e + (now - last) / 1000);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paused, source]);

  // Restart the breathing cycle at Inhale when the signal goes live
  useEffect(() => { if (source !== "idle") setElapsed(0); }, [source]);

  // Record real readings only (one point per new reading, max once a second)
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      if (!vitals.t || vitals.t === lastSampled.current) return;
      lastSampled.current = vitals.t;
      setSeries((s) => {
        const push = (a: number[], v?: number) => (v && v > 0 ? [...a, v].slice(-40) : a);
        return {
          pulse: push(s.pulse, vitals.pulse),
          breathing: push(s.breathing, vitals.breathing),
          hrv: push(s.hrv, vitals.hrv),
          calm: calm === null ? s.calm : [...s.calm, { t: Date.now(), v: calm }].slice(-600),
        };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, vitals.t, vitals.pulse, vitals.breathing, vitals.hrv, calm]);

  async function begin() {
    setError(null);
    audio.current = new AudioEngine();
    await audio.current.start();
    audio.current.setMuted(muted);
    setRunning(true);
    setElapsed(0);

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
      const est = new BrowserPulse(v, (pulse, breathing) => {
        if (!pulse && !breathing) return;
        setVitals((p) => ({ ...p, pulse: pulse ?? p.pulse, breathing: breathing ?? p.breathing, t: Date.now() }));
      });
      est.start();
      setSource("browser");
      let stopFace = () => {};
      let alive = true;
      cleanup.current = () => {
        alive = false; est.stop(); stopFace(); pointsRef.current = null; setFace("off");
        stream.getTracks().forEach((t) => t.stop());
      };
      setFace("loading");
      setFaceError(null);
      createFaceTracker(v, (f) => {
        pointsRef.current = f.points;
        est.setRoi(f.forehead);
        setFace(f.points ? "ready" : "noface");
        setVitals((p) => (p.expression === (f.points ? f.expression : undefined) ? p : { ...p, expression: f.points ? f.expression : undefined }));
      })
        .then((s) => { if (alive) stopFace = s; else s(); })
        .catch((e) => {
          console.error("face tracker", e);
          setFace("error");
          setFaceError("Face tracker failed to load. Check your connection and reload.");
        });
    } catch (e) {
      console.error("camera", e);
      setError("Camera access was blocked. Allow the camera to start a session.");
    }
  }

  function stop() {
    cleanup.current();
    cleanup.current = () => {};
    audio.current?.close();
    audio.current = null;
    setRunning(false);
    setSource("idle");
    setVitals({ t: 0 });
  }

  // Breathing phase
  const inCycle = elapsed % CYCLE;
  let acc = 0;
  let phaseIdx = 0;
  for (let i = 0; i < PHASES.length; i++) {
    const secs = PHASES[i]!.secs;
    if (inCycle < acc + secs) { phaseIdx = i; break; }
    acc += secs;
  }
  const phase = PHASES[phaseIdx]!;
  const phaseLeft = Math.ceil(acc + phase.secs - inCycle);

  const delta = (a: number[]) => (a.length > 5 ? Math.round(a[a.length - 1]! - a[a.length - 6]!) : undefined);
  const mood = vitals.expression ?? (score === null ? "Waiting" : score < 0.45 ? "Relaxed" : score < 0.65 ? "Focused" : "Tense");
  const firstCalm = series.calm[0]?.v;
  const sourceLabel = source === "presage" ? "Live · SmartSpectra" : source === "browser" ? "Live · browser estimate" : running ? "Connecting…" : "Camera off";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6 md:grid-cols-[1fr_auto_1fr] lg:px-8">
          <div className="flex min-w-0 items-center gap-2.5">
            <LotusIcon />
            <span className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              Calm<span className="text-primary">Pulse</span>
            </span>
          </div>
          <nav className="no-scrollbar order-3 col-span-2 -mx-1 flex gap-1 overflow-x-auto md:order-none md:col-span-1 md:mx-0 md:gap-2">
            {["Home", "Practice", "Insights", "About"].map((n, i) => (
              <a key={n} href={i === 0 ? "#" : i === 3 ? "#privacy" : "#calm"} className={`relative shrink-0 px-3 py-2 text-sm font-medium transition-colors ${i === 0 ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {n}
                {i === 0 && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-primary" />}
              </a>
            ))}
          </nav>
          <div className="flex items-center justify-end gap-2">
            {running && (
              <>
                <button onClick={() => { setMuted(!muted); audio.current?.setMuted(!muted); }} className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button onClick={stop} className="rounded-full border border-pulse/40 px-3 py-1.5 text-sm font-medium text-pulse hover:bg-pulse/10">End</button>
              </>
            )}
            <p className="hidden text-right text-sm leading-tight text-muted-foreground xl:block">A calmer you<br />brighter tomorrow</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6 lg:space-y-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 lg:gap-6 xl:grid-cols-[1fr_1fr_1fr]">
          {/* Camera panel */}
          <section className="relative aspect-[4/5] overflow-hidden rounded-[1.25rem] border border-border bg-panel sm:aspect-[4/3] md:aspect-auto md:min-h-[420px]">
            <video ref={videoRef} muted playsInline className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${source === "browser" ? "opacity-100" : "opacity-0"}`} />
            {source !== "browser" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                {running && source === "presage" ? (
                  <>
                    <div className="grid h-24 w-24 place-items-center rounded-full bg-primary/10 ring-glow"><WaveIcon className="h-10 w-10 text-primary" /></div>
                    <p className="max-w-xs text-sm text-muted-foreground">The SmartSpectra companion is reading your camera on this computer. Video never reaches the browser.</p>
                  </>
                ) : !running ? (
                  <>
                    <div className="grid h-20 w-20 place-items-center rounded-full bg-primary/10"><CameraIcon /></div>
                    <h2 className="text-xl font-semibold">Start a calm session</h2>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      CalmPulse uses your camera to read pulse, breathing and HRV. Everything is processed on your device and nothing is recorded or uploaded.
                    </p>
                    <button onClick={begin} className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-[0_0_40px_-8px_var(--primary)] transition-transform hover:scale-105">
                      Allow camera & begin
                    </button>
                    <a href="#privacy" className="text-xs text-muted-foreground underline underline-offset-4">How your data is handled</a>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Connecting to your camera…</p>
                )}
              </div>
            )}
            <div className="glass-chip absolute left-4 top-4 flex items-center gap-2 px-3.5 py-2 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${running ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
              {sourceLabel}
            </div>
            {running && (
              <div className="glass-chip absolute bottom-4 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-2 px-4 py-2.5 text-sm">
                <WaveIcon className="h-4 w-4 shrink-0 text-pulse" />
                <span className="truncate">{error ?? vitals.hint ?? "Tracking calm signals"}</span>
              </div>
            )}
          </section>

          {/* Breathing guide */}
          <section className="flex flex-col items-center justify-center gap-6 py-4 md:order-none">
            <BreathRing progress={running ? inCycle / CYCLE : 0.25} phaseProgress={running ? (inCycle - acc) / phase.secs : 0}>
              <p className="text-3xl font-semibold sm:text-4xl">{running ? phase.title : "Breathe in"}</p>
              <p className="mt-3 font-mono text-lg tracking-[0.2em] text-muted-foreground sm:text-xl">{running ? `${phaseLeft}s` : "4·4·6·4"}</p>
              <p className="mt-1 text-sm text-muted-foreground">Box Breathing</p>
            </BreathRing>
            <div className="flex w-full max-w-md items-center gap-3 sm:gap-6">
              <button
                onClick={() => (running ? setPaused(!paused) : begin())}
                aria-label={running && !paused ? "Pause" : "Play"}
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border bg-panel transition-colors hover:border-primary sm:h-16 sm:w-16"
              >
                {running && !paused ? <PauseIcon /> : <PlayIcon />}
              </button>
              <div className="grid flex-1 grid-cols-4 text-center">
                {PHASES.map((p, i) => (
                  <div key={i} className={`relative pb-2 text-sm ${running && i === phaseIdx ? "text-foreground" : "text-muted-foreground"}`}>
                    <p className="font-medium">{p.label}</p>
                    <p>{p.secs}s</p>
                    {running && i === phaseIdx && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Metrics */}
          <section className="grid gap-4 md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
            <MetricCard icon={<HeartIcon />} iconBg="bg-pulse/15" label="Pulse" value={vitals.pulse} unit="BPM" delta={delta(series.pulse)}>
              <Sparkline data={series.pulse} className="text-pulse" />
            </MetricCard>
            <MetricCard icon={<LungsIcon />} iconBg="bg-primary/10" label="Breathing" value={vitals.breathing} unit="/min" delta={delta(series.breathing)}>
              <Sparkline data={series.breathing} className="text-primary" fill />
            </MetricCard>
            <MetricCard icon={<BarsIcon />} iconBg="bg-primary/10" label="HRV" value={vitals.hrv} unit="ms" delta={delta(series.hrv)} higherIsGood note={source === "browser" ? "Needs SmartSpectra" : undefined}>
              <Bars data={series.hrv} />
            </MetricCard>
            <div className="panel flex items-center gap-4 p-5">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><SmileIcon /></div>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground">Mood</p>
                <p className="truncate text-2xl font-semibold capitalize">{running ? mood : "—"}</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium">
                <span className="h-2.5 w-2.5 rounded-full bg-primary" />{running ? moodLabel(score).replace("…", "") : "Idle"}
              </span>
            </div>
          </section>
        </div>

        {/* Calm score */}
        <section id="calm" className="panel grid gap-6 p-5 sm:p-7 lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:items-center">
          <div>
            <p className="text-lg font-medium">Calm Score</p>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="text-6xl font-bold tracking-tight">{calm ?? "—"}</span>
              <span className="text-xl text-muted-foreground">/ 100</span>
              {calm !== null && firstCalm !== undefined && (
                <span className={`text-lg ${calm >= firstCalm ? "text-primary" : "text-pulse"}`}>{calm >= firstCalm ? "↑" : "↓"} {Math.abs(calm - firstCalm)}</span>
              )}
            </p>
            <p className="mt-3 text-muted-foreground">{firstCalm !== undefined && calm !== null ? (calm >= firstCalm ? "Calmer than when you started" : "Keep breathing slowly") : "Begin a session to see it change"}</p>
          </div>
          <CalmChart data={series.calm} />
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-panel-inner/40 p-5">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary/10"><SunIcon /></div>
            <div>
              <p className="text-lg font-medium leading-snug">{insight(calm, firstCalm)}</p>
              <p className="mt-2 text-sm text-muted-foreground">Follow the ring: in 4, hold 4, out 6, hold 4.</p>
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section id="privacy" className="panel p-5 text-sm text-muted-foreground sm:p-7">
          <p className="mb-2 text-base font-semibold text-foreground">Camera consent & your data</p>
          <p>
            The camera only turns on after you press “Allow camera & begin”, and your browser asks for permission. With the SmartSpectra companion, video is processed on your computer by the Presage SDK and only numbers (pulse, breathing, HRV) are sent to this page. Without it, a rough estimate runs entirely in your browser. Nothing is recorded, stored, or shared, and readings vanish when you press End or close the tab. CalmPulse is a wellbeing exercise, not a medical device.
          </p>
        </section>
      </main>
    </div>
  );
}

function insight(calm: number | null, first?: number) {
  if (calm === null) return "Your calm insights appear here.";
  if (first !== undefined && calm > first + 5) return "You're more calm than when you started.";
  if (calm >= 65) return "You're in a calm place. Great job staying present.";
  return "Slow your exhale a little more.";
}

function BreathRing({ progress, phaseProgress, children }: { progress: number; phaseProgress: number; children: ReactNode }) {
  const r = 150, c = 2 * Math.PI * r;
  const scale = 0.94 + 0.06 * Math.sin(phaseProgress * Math.PI);
  return (
    <div className="relative aspect-square w-full max-w-[min(380px,80vw)]">
      <svg viewBox="0 0 360 360" className="absolute inset-0 h-full w-full -rotate-90">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        <circle cx="180" cy="180" r="172" fill="none" stroke="var(--primary)" strokeOpacity="0.06" strokeWidth="1" />
        <circle cx="180" cy="180" r={r} fill="var(--panel)" fillOpacity="0.5" stroke="var(--panel-inner)" strokeWidth="26" />
        <circle
          cx="180" cy="180" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="26" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0.02, progress))} className="ring-glow"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center transition-transform duration-300" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

function MetricCard({ icon, iconBg, label, value, unit, delta, higherIsGood, note, children }: {
  icon: ReactNode; iconBg: string; label: string; value?: number | undefined; unit: string; delta?: number | undefined; higherIsGood?: boolean; note?: string | undefined; children: ReactNode;
}) {
  const good = delta === undefined ? true : higherIsGood ? delta >= 0 : delta <= 0;
  return (
    <div className="panel grid grid-cols-[auto_minmax(0,1fr)] gap-4 p-5 sm:grid-cols-[auto_auto_minmax(0,1fr)]">
      <div className={`grid h-14 w-14 place-items-center rounded-full ${iconBg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-muted-foreground">{label}</p>
        <p className="mt-1 flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-3xl font-bold">{value != null && Number.isFinite(value) && value > 0 ? Math.round(value) : "—"}</span>
          <span className="text-muted-foreground">{unit}</span>
          {delta !== undefined && delta !== 0 && <span className={`ml-2 text-sm ${good ? "text-primary" : "text-pulse"}`}>{delta > 0 ? "↑" : "↓"} {Math.abs(delta)}</span>}
        </p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
        <p className="text-right text-xs text-muted-foreground">Real-time</p>
        <div className="h-12">{children}</div>
      </div>
    </div>
  );
}

function path(data: number[], w: number, h: number) {
  if (data.length < 2) return "";
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  return data.map((v, i) => `${i ? "L" : "M"}${(i / (data.length - 1)) * w},${h - 4 - ((v - lo) / span) * (h - 8)}`).join(" ");
}

function Sparkline({ data, className, fill }: { data: number[]; className: string; fill?: boolean }) {
  const d = path(data, 200, 48);
  return (
    <svg viewBox="0 0 200 48" preserveAspectRatio="none" className={`h-full w-full ${className}`}>
      {!d && <line x1="0" y1="24" x2="200" y2="24" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="4 4" />}
      {d && fill && <path d={`${d} L200,48 L0,48 Z`} fill="currentColor" fillOpacity="0.12" />}
      {d && <path d={d} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

function Bars({ data }: { data: number[] }) {
  const show = data.slice(-14);
  const hi = Math.max(1, ...show);
  return (
    <div className="flex h-full items-end justify-end gap-1.5">
      {show.length === 0 && <span className="self-center text-xs text-muted-foreground">waiting…</span>}
      {show.map((v, i) => (
        <span key={i} className="w-1.5 rounded-full bg-primary" style={{ height: `${20 + (v / hi) * 80}%`, opacity: 0.4 + (i / show.length) * 0.6 }} />
      ))}
    </div>
  );
}

function CalmChart({ data }: { data: { t: number; v: number }[] }) {
  const W = 800, H = 160;
  const pts = data.map((p, i) => [data.length > 1 ? (i / (data.length - 1)) * W : 0, H - 10 - (p.v / 100) * (H - 20)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  const fmt = (t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const last = pts[pts.length - 1];
  return (
    <div className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-36 w-full sm:h-40">
        <defs>
          <linearGradient id="calmLine" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="65%" stopColor="var(--pulse)" />
            <stop offset="100%" stopColor="var(--primary)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--border)" />)}
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} stroke="var(--border)" />
        {data.length < 2 ? (
          <text x={W / 2} y={H / 2} textAnchor="middle" fill="var(--muted-foreground)" fontSize="16">Your calm over this session will draw here</text>
        ) : (
          <>
            <path d={`${d} L${W},${H} L0,${H} Z`} fill="var(--primary)" fillOpacity="0.06" />
            <path d={d} fill="none" stroke="url(#calmLine)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      {last && data.length > 1 && <span className="sr-only">Latest {data[data.length - 1]!.v}</span>}
      <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
        <span>{data[0] ? fmt(data[0].t) : "start"}</span>
        <span>{data.length ? fmt(data[data.length - 1]!.t) : "now"}</span>
      </div>
    </div>
  );
}

/* Icons */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
function LotusIcon() {
  return (
    <svg viewBox="0 0 40 32" className="h-8 w-10 shrink-0 text-primary" {...S}>
      <path d="M20 4c4 4 5 10 0 18-5-8-4-14 0-18Z" /><path d="M20 22c3-6 8-9 13-9-1 6-6 10-13 9Z" /><path d="M20 22c-3-6-8-9-13-9 1 6 6 10 13 9Z" /><path d="M20 26c6 0 12-2 17-6M20 26c-6 0-12-2-17-6" />
    </svg>
  );
}
function HeartIcon() { return <svg viewBox="0 0 24 24" className="h-7 w-7 text-pulse"><path fill="currentColor" d="M12 21s-7.5-4.6-9.5-9.3C1 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.6 0 6 3.5 4.5 7.2C19.5 16.4 12 21 12 21Z" /></svg>; }
function LungsIcon() { return <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary" {...S}><path d="M12 3v8m0 0-3 2m3-2 3 2" /><path d="M8 7c-3 1-5 6-5 10 0 2 1 3 3 3s3-1 3-3V9" /><path d="M16 7c3 1 5 6 5 10 0 2-1 3-3 3s-3-1-3-3V9" /></svg>; }
function BarsIcon() { return <svg viewBox="0 0 24 24" className="h-7 w-7 text-primary"><rect x="3" y="13" width="4" height="8" rx="1.5" fill="currentColor" /><rect x="10" y="8" width="4" height="13" rx="1.5" fill="currentColor" /><rect x="17" y="3" width="4" height="18" rx="1.5" fill="currentColor" /></svg>; }
function SmileIcon() { return <svg viewBox="0 0 24 24" className="h-8 w-8" {...S} strokeWidth={2.2}><circle cx="9" cy="10" r="0.6" fill="currentColor" /><circle cx="15" cy="10" r="0.6" fill="currentColor" /><path d="M8 14.5c2 2.2 6 2.2 8 0" /></svg>; }
function SunIcon() { return <svg viewBox="0 0 24 24" className="h-8 w-8 text-primary" {...S}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
function WaveIcon({ className }: { className: string }) { return <svg viewBox="0 0 24 24" className={className} {...S}><path d="M3 12h2M7 8v8M11 4v16M15 8v8M19 11v2M21 12h0" /></svg>; }
function CameraIcon() { return <svg viewBox="0 0 24 24" className="h-9 w-9 text-primary" {...S}><rect x="3" y="6" width="13" height="12" rx="3" /><path d="m16 10 5-3v10l-5-3" /></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" className="h-6 w-6"><rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" /></svg>; }
function PlayIcon() { return <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 text-primary"><path fill="currentColor" d="M7 4.5v15l12-7.5-12-7.5Z" /></svg>; }
