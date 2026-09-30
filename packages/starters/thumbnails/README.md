# Starter thumbnails

Screenshots of each starter's first tab, rendered by the real app on web:

1. Assemble the foundation (`App.tsx`, `app.json` with the starter's name, `tsconfig.json`, `src/theme`, `src/components`, `src/data/store.ts`) and `<slug>/src/` in a scratch directory whose `package.json` has the `foundation.json` dependencies plus `react-dom`, `react-native-web`, and `@expo/metro-runtime` at their SDK 54 versions, and `"main": "node_modules/expo/AppEntry.js"`.
2. `npx expo export --platform web --output-dir dist`, then serve `dist/`.
3. Headless Chrome with a fresh profile, `--window-size=500,1082 --force-device-scale-factor=2 --virtual-time-budget=8000 --screenshot=<slug>.png` (headless Chrome will not lay out narrower than about 500 px).
4. `sips --resampleWidth 500 <slug>.png`.
