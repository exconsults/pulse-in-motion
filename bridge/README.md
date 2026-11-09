# Presage bridge (SmartSpectra companion)

The SmartSpectra SDK is native code, so it can only run on your computer — not inside a web page.
The browser opens the camera and sends small frames to this companion over `ws://localhost:8787`;
SmartSpectra returns pulse, breathing and HRV. The bridge never opens the camera itself.

Needs Node.js 20+ and macOS Apple Silicon, Windows x64, or Linux (glibc 2.35+). Intel Macs are not supported by Presage.

## Easiest: double-click
- **Windows:** double-click `start-windows.bat`
- **Mac / Linux:** double-click `start-mac-linux.command` (first time: `chmod +x start-mac-linux.command`)

Install Node.js 20+ first. It installs dependencies once, asks for your API key once (saved to `bridge/.env`, never committed), then runs. Keep the window open. Double-clicking still opens a local command window: a website cannot launch native software by itself.

## Terminal
    cd bridge
    npm install
    npm start

`npm start` asks for the key if needed; no key-in-command syntax is necessary, including on Windows. Use a newly issued key if your old key was shared in chat. To replace a rejected key, delete `bridge/.env` and launch again.

Open CalmPulse in **Chrome or Edge** on the same computer and press **Allow camera & begin**.
The badge reads **Live · SmartSpectra**. Safari blocks connections to localhost from https pages.
If Chrome asks to allow "local network access", click Allow.

## Troubleshooting
- The terminal never opens the camera. Open the web app and press **Allow camera & begin**.
- Close Zoom/Teams or other camera apps if the camera is busy. Allow camera permission for this site and retry.
- “API key rejected (403)” means Presage rejected authentication; check your new key and Presage account access.
- “SmartSpectra 3: configuration failed” with “device_id is required for remote model download” came from requesting arterial-pressure readings, which need a device key that some Windows computers cannot create. The companion now asks only for pulse, HRV and breathing, and retries with breathing only if configuration still fails.
- “Port 8787 is already in use” means another companion window is open; close it first.
- Face landmarks need internet for model/software downloads. Face-tracker errors are shown on the camera.
- Wait for readings with your face well lit and still. HRV requires SmartSpectra; browser estimates are not medical measurements.
- After updating the companion, close its old window and run `npm start` inside `bridge` again. Keep the web app open in the foreground and press **Allow camera & begin**; the terminal does not open the camera.
- Frame timestamps now begin with each camera session, not when the companion window opened. If frames stop for more than two seconds (for example, a background tab), the app reports the interruption; press **End** and begin again. Real time gaps are not shortened to manufacture readings.
- Only one CalmPulse tab can use the companion at a time. The listener is restricted to this computer.

## Published website
The companion accepts this project's preview and local development origins. When you publish or use a custom domain, add the exact website origin to `bridge/.env`:

    CALMPULSE_ALLOWED_ORIGINS=https://your-actual-site.lovable.app

Use your real site address, not the example. Restart the companion after changing it. Multiple origins can be comma-separated. This prevents arbitrary websites from connecting to the native SDK.

## Data handling and verification
Camera frames and readings are transient; the bridge does not save them. The API key persists in `.env` until you delete it. SmartSpectra needs internet for its service. SDK telemetry/vendor retention have not been independently audited. No optional AI service is used. Native live measurements must still be verified on a supported computer with a valid key and a real face before claiming production readiness.
