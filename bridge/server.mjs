// Resonance ⇄ Presage SmartSpectra bridge.
// Runs the SmartSpectra Node SDK on your computer (it needs native libraries,
// so it can't run inside a browser) and streams metrics to the web app.
//
//   cd bridge && npm install
//   SMARTSPECTRA_API_KEY=your_key npm start
//
import { WebSocketServer } from "ws";
import {
  SmartSpectraSDK, CameraSelection, decodeMetrics,
  breathingMetrics, cardioMetrics, faceMetrics,
} from "@smartspectra/node-sdk";

const apiKey = process.env.SMARTSPECTRA_API_KEY;
if (!apiKey) {
  console.error("Set SMARTSPECTRA_API_KEY first.");
  process.exit(1);
}

const HINTS = {
  0: "", 1: "No face found", 2: "Only one person, please", 3: "Centre your face",
  5: "Too dark", 6: "Too bright", 7: "Show your upper chest", 12: "Try to stay still",
  13: "Move back a little", 14: "Move closer", 17: "Face the camera",
};

const wss = new WebSocketServer({ port: 8787 });
const send = (msg) => {
  const s = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === 1) c.send(s);
};

const sdk = new SmartSpectraSDK({
  apiKey,
  requestedMetrics: [...breathingMetrics, ...cardioMetrics, ...faceMetrics],
});
sdk.on("metrics", (buf) => {
  const m = decodeMetrics(buf);
  if (!Buffer.isBuffer(m)) send({ type: "metrics", metrics: m });
});
sdk.on("validationStatus", (code, _ts, hint) => send({ type: "hint", hint: HINTS[code] ?? hint }));
sdk.on("error", (code, message) => send({ type: "error", message: `SmartSpectra ${code}: ${message}` }));

sdk.useCamera(CameraSelection.default).start();
console.log("SmartSpectra running — open Resonance and press Begin. (ws://localhost:8787)");

process.on("SIGINT", async () => { await sdk.destroy(); process.exit(0); });
