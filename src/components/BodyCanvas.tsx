import { useEffect, useRef } from "react";

interface Props {
  stress: number; // 0..1
  bpm: number;
  breathing: number; // per minute
}

/** Flowing generative field: colour/turbulence follow stress, glow beats with the heart, scale breathes. */
export function BodyCanvas({ stress, bpm, breathing }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ stress, bpm, breathing, s: stress });
  live.current.stress = stress;
  live.current.bpm = bpm;
  live.current.breathing = breathing;

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const css = getComputedStyle(document.documentElement);
    const calm = css.getPropertyValue("--calm-hue").trim() || "190";
    const tense = css.getPropertyValue("--tense-hue").trim() || "25";
    const particles = Array.from({ length: 900 }, () => ({
      x: Math.random(),
      y: Math.random(),
      h: Math.random(),
    }));
    let raf = 0;
    const resize = () => {
      c.width = c.clientWidth * devicePixelRatio;
      c.height = c.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (ms: number) => {
      raf = requestAnimationFrame(draw);
      const L = live.current;
      L.s += (L.stress - L.s) * 0.02;
      const s = L.s;
      const t = ms / 1000;
      const W = c.width, H = c.height;
      const hue = +calm + (+tense - +calm) * s;
      const beatPhase = (t * L.bpm) / 60;
      const beat = Math.pow(Math.max(0, Math.cos(beatPhase * Math.PI * 2)), 12);
      const breath = 0.5 + 0.5 * Math.sin((t * L.breathing * Math.PI * 2) / 60);

      ctx.fillStyle = `oklch(0.12 0.03 ${hue} / ${0.08 + s * 0.06})`;
      ctx.fillRect(0, 0, W, H);

      // heart glow
      const R = Math.min(W, H) * (0.18 + breath * 0.08 + beat * 0.04);
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, R * 2.2);
      g.addColorStop(0, `oklch(0.75 0.17 ${hue} / ${0.12 + beat * 0.25})`);
      g.addColorStop(1, `oklch(0.2 0.05 ${hue} / 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const turb = 1 + s * 5;
      const speed = 0.0006 + s * 0.003;
      for (const p of particles) {
        const a =
          Math.sin(p.x * 3 * turb + t * 0.3) * Math.PI +
          Math.cos(p.y * 3 * turb - t * 0.2) * Math.PI;
        const dx = p.x - 0.5, dy = p.y - 0.5;
        const pull = (breath - 0.5) * 0.0015;
        p.x += Math.cos(a) * speed - dx * pull;
        p.y += Math.sin(a) * speed - dy * pull;
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
          p.x = Math.random();
          p.y = Math.random();
        }
        const light = 0.6 + p.h * 0.3 + beat * 0.1;
        ctx.fillStyle = `oklch(${light} ${0.12 + s * 0.08} ${hue + (p.h - 0.5) * 40} / 0.7)`;
        const size = (1 + p.h * 1.6 + beat) * devicePixelRatio;
        ctx.fillRect(p.x * W, p.y * H, size, size);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden />;
}
