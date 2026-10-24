# Ark Mode

Offline habit tracker for JEE prep, built on Habitica's rules (lite: health, XP, gold, levels).
Tasks (habits, dailies, to-dos), rewards, PT score tracker with mistake log, backlog, focus timer, weekly review.

- Day resets at 3 AM (change in You → Settings).
- All data stays on the phone. Use You → Backup now and then.

## Getting the APK
Every push to `main` runs `.github/workflows/build-apk.yml`, which builds a signed APK and publishes it under Releases.
On the phone, open the latest release and install `ArkMode.apk`. New builds install over the old one and keep your data.

## Working on it
npm install, npx vite (browser preview), node tests/engine.test.mjs (game-rule tests).
