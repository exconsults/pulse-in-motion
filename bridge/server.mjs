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
const wss = new WebSocketServer({ port: PORT });
const send = (msg) => {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
};

let sdk = null;
let lastTs = 0;
let failed = false;

async function startSdk() {
  if (sdk) return;
  sdk = new SmartSpectraSDK({ apiKey, requestedMetrics: [...breathingMetrics, ...cardioMetrics] });
  sdk.on("metrics", (buf) => {
    const m = decodeMetrics(buf);
    if (!Buffer.isBuffer(m)) send({ type: "metrics", metrics: m });
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
  lastTs = 0;
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
  console.log("CalmPulse connected.");
  try { await startSdk(); } catch (e) {
    ws.send(JSON.stringify({ type: "error", message: String(e?.message ?? e) }));
  }
  ws.on("message", (data, isBinary) => {
    if (!isBinary || !sdk) return;
    // frame layout: [u16 width][u16 height] + RGBA pixels
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const w = b.readUInt16LE(0), h = b.readUInt16LE(2);
    if (b.length < 4 + w * h * 4) return;
    let ts = Math.round(performance.now() * 1000);
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    try {
      sdk.sendFrame(b.subarray(4, 4 + w * h * 4), w, h, w * 4, PixelFormat.kRGBA, ts);
    } catch (e) {
      if (!failed) {
        failed = true;
        const msg = "SmartSpectra stopped: " + (e?.message ?? e) + " Check your API key, credits and internet, then restart the bridge.";
        console.error(msg);
        send({ type: "error", message: msg });
      }
    }
  });
  ws.on("close", () => {
    console.log("CalmPulse disconnected.");
    if (wss.clients.size === 0) void stopSdk();
  });
});

console.log(`Bridge ready on ws://localhost:${PORT} — open CalmPulse and press "Allow camera & begin". Keep this window open.`);
process.on("SIGINT", async () => { await stopSdk(); process.exit(0); });
