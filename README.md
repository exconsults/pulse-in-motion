# Pulse in Motion

Best Overall Human-Sensing Experience

Build a working experience with the Presage SmartSpectra SDK that responds meaningfully to real-time human signals captured through a camera.     The Presage SmartSpectra SDK Challenge is officially live!

Build a working experience that responds meaningfully to real-time human signals captured through a camera, and enter a prize category for another shot at winning.

The Presage SmartSpectra SDK lets your app capture real-time human signals through a camera, such as pulse, breathing rate, HRV, or expressions, so you can build experiences that respond to the people using them. Read on to learn more.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a5b89a70-3c1d-4ea8-b074-459e5d6d9822).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## CalmPulse camera and SmartSpectra setup in VS Code

1. In GitHub, choose **Code → Download ZIP**, extract the project, and open that folder in VS Code (or clone the repository).
2. Install Node.js 20+ on a supported computer.
3. In VS Code's terminal, run `npm install`, then `npm run dev`. Open the localhost address printed by Vite.
4. Start the companion by double-clicking `bridge/start-windows.bat` or `bridge/start-mac-linux.command`. On Mac/Linux, run `chmod +x bridge/start-mac-linux.command` once if needed.
5. Alternatively, open a **second terminal** and run:

```sh
cd bridge
npm install
npm start
```

The companion prompts for your new Presage key on first use. Do not paste keys into GitHub or chat. Keep both programs running. The terminal does **not** open the camera: in the web app, press **Allow camera & begin**, and allow camera and local-network access in Chrome/Edge. A website cannot run the native Presage SDK without the local companion.

See [the companion guide](bridge/README.md) for supported computers, published-site permissions, and troubleshooting. Real SmartSpectra measurements require a valid key, internet connectivity, and a real face; browser camera tests are not certification of physiological accuracy.
