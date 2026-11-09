# Production-readiness follow-up

- [x] Add a session-relative companion frame clock with timing regression tests; report long interruptions instead of manufacturing shorter intervals.

- [x] Fix camera startup, stop/retry, and companion fallback handling.
- [x] Harden companion startup and document double-click / VS Code setup.
- [x] Run automated checks and browser camera-flow checks.
- [x] Identify remaining real-camera / valid-key verification limits: native readings and landmark alignment require a supported computer, real face, and valid Presage key; not certified by simulated camera tests.- [x] Stop requesting device-key metrics (arterial pressure) that caused "SmartSpectra 3: configuration failed"; add breathing-only fallback and tests.
