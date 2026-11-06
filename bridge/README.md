# Presage bridge (SmartSpectra companion)

The SmartSpectra SDK is native code, so it can only run on your computer — not inside a web page.
The browser opens the camera and sends small frames to this companion over `ws://localhost:8787`;
SmartSpectra returns pulse, breathing and HRV. The bridge never opens the camera itself.

Needs Node.js 20+ and macOS Apple Silicon, Windows x64, or Linux (glibc 2.35+). Intel Macs are not supported by Presage.

## Easiest: double-click
- **Windows:** double-click `start-windows.bat`
- **Mac / Linux:** double-click `start-mac-linux.command` (first time: `chmod +x start-mac-linux.command`)

It installs once, asks for your API key once (saved to `bridge/.env`, never committed), then runs.

## Terminal
    cd bridge
    npm install
    echo SMARTSPECTRA_API_KEY=your_key > .env
    npm start

Open CalmPulse in **Chrome or Edge** on the same computer and press **Allow camera & begin**.
The badge reads **Live · SmartSpectra**. Safari blocks connections to localhost from https pages.
If Chrome asks to allow "local network access", click Allow.
