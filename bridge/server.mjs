// CalmPulse ⇄ Presage SmartSpectra bridge.
// The browser already owns the camera, so it streams small frames here over
// ws://localhost:8787 and the SmartSpectra SDK (native, runs only on your
// computer) turns them into pulse / breathing / HRV, sent back on the same socket.
//
// Key: put SMARTSPECTRA_API_KEY=... in bridge/.env (once), or set it in the shell.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocketServer } from "ws";
import { decodeFrame } from "./protocol.mjs";
import { FrameClock } from "./frame-clock.mjs";
import {
  SmartSpectraSDK, PixelFormat, FrameTransform, decodeMetrics,
  breathingMetrics, cardioMetrics,
} from "@smartspectra/node-sdk";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
const apiKey = process.env.SMARTSPECTRA_API_KEY;
if (!apiKey) {
  console.error("No API key. Create bridge/.env containing:  SMARTSPECTRA_API_KEY=your_key");
  process.exit(1);
}

const HINTS = {
  0: "", 1: "No face found", 2: "Only one person, please", 3: "Centre your face",
  5: "Too dark", 6: "Too bright", 7: "Show your upper chest", 11: "Frame rate too low",
  12: "Try to stay still", 13: "Move back a little", 14: "Move closer", 17: "Face the camera",
};

const PORT = 8787;
const allowedOrigins = new Set([
  "https://id-preview--a5b89a70-3c1d-4ea8-b074-459e5d6d9822.lovable.app",
  "https://a5b89a70-3c1d-4ea8-b074-459e5d6d9822.lovableproject.com",
  ...(process.env.CALMPULSE_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
]);
const wss = new WebSocketServer({
  host: "127.0.0.1", port: PORT, maxPayload: 4 + 1920 * 1080 * 4,
  verifyClient: ({ origin }) => {
    if (allowedOrigins.has(origin)) return true;
    try { const u = new URL(origin); return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname); }
    catch { return false; }
  },
});
wss.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? "Port 8787 is already in use. Close the other companion window, then try again." : "The companion could not listen: " + e.message);
  process.exitCode = 1;
});
const send = (msg) => {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
};

let sdk = null;
let frameClock = new FrameClock();
let failed = false;
let activeClient = null;
let stopping = Promise.resolve();

async function startSdk() {
  if (sdk) return;
  sdk = new SmartSpectraSDK({ apiKey, requestedMetrics: [...breathingMetrics, ...cardioMetrics] });
  sdk.on("metrics", (buf) => {
    try {
      const m = decodeMetrics(buf);
      if (!Buffer.isBuffer(m)) send({ type: "metrics", metrics: m });
      else send({ type: "error", message: "SDK metrics decoder unavailable. Reinstall companion dependencies." });
    } catch { send({ type: "error", message: "Unable to decode SmartSpectra readings. Restart the companion." }); }
  });
  sdk.on("validationStatus", (code, _ts, hint) => send({ type: "hint", hint: HINTS[code] ?? hint ?? "" }));
  sdk.on("error", (code, message) => {
    if (code === 2) message = "API key rejected (403). Make a new key at physiology.presagetech.com and put it in bridge/.env.";
    if (code === 4) message = "Your Presage credits are used up.";
    console.error(`SmartSpectra error ${code}: ${message}`);
    send({ type: "error", message: `SmartSpectra ${code}: ${message}` });
  });
  sdk.useCustomInput(FrameTransform.kNone);
  sdk.start();
  frameClock = new FrameClock();
  failed = false;
  console.log("SmartSpectra started.");
}

async function stopSdk() {
  if (!sdk) return;
  const s = sdk;
  sdk = null;
  try { await s.stopAsync(); await s.destroy(); } catch (e) { console.error(e); }
  console.log("SmartSpectra stopped.");
}

wss.on("connection", async (ws) => {
  if (activeClient) { ws.close(1008, "A session is already active. Close the other CalmPulse tab."); return; }
  activeClient = ws;
  ws.on("error", () => ws.close());
  ws.on("close", () => {
    console.log("CalmPulse disconnected.");
    stopping = stopSdk().finally(() => { if (activeClient === ws) activeClient = null; });
  });
  console.log("CalmPulse connected.");
  try {
    await stopping;
    if (ws.readyState !== 1) return;
    await startSdk();
  } catch (e) {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: "error", message: String(e?.message ?? e) }));
    await stopSdk();
    ws.close();
    return;
  }
  ws.on("message", (data, isBinary) => {
    if (!isBinary || !sdk) return;
    // frame layout: [u16 width][u16 height] + RGBA pixels
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const frame = decodeFrame(b);
    if (!frame) { ws.close(1008, "Invalid camera frame"); return; }
    const { width: w, height: h, pixels } = frame;
    const ts = frameClock.next(performance.now());
    if (ts === null) {
      ws.send(JSON.stringify({ type: "error", message: "Camera frames paused for more than 2 seconds. Keep CalmPulse in the foreground, press End, then begin a new session." }));
      ws.close(1008, "Camera frame timing interrupted");
      return;
    }
    try {
      sdk.sendFrame(pixels, w, h, w * 4, PixelFormat.kRGBA, ts);
    } catch (e) {
      if (!failed) {
        failed = true;
        const msg = "SmartSpectra stopped: " + (e?.message ?? e) + " Check your API key, credits and internet, then restart the bridge.";
        console.error(msg);
        send({ type: "error", message: msg });
      }
    }
  });
});

wss.on("listening", () => console.log(`Bridge ready on ws://localhost:${PORT} — open CalmPulse in Chrome/Edge and press "Allow camera & begin". Keep this window open.`));
process.on("SIGINT", async () => { await stopSdk(); process.exit(0); });
