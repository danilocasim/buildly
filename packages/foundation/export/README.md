# {{appName}}

A React Native app built with [Expo](https://expo.dev) (SDK {{sdkMajor}}) and TypeScript.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer, and the **Expo Go** app on your phone ([iOS](https://apps.apple.com/app/expo-go/id982107779), [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)).

```bash
npm install
npx expo start
```

Scan the QR code in the terminal: with the Camera app on iPhone, or from inside Expo Go on Android. Your phone and computer must be on the same network (use `npx expo start --tunnel` if they are not). Press `w` in the terminal to open the web version instead.

Check the types at any time with `npx tsc --noEmit`.

## Folder layout

```
App.tsx                 Entry point: theme, navigation, data store, error handling
app.json                App name and Expo settings
src/navigation.tsx      Every screen and tab is registered here
src/screens/            One file per screen
src/data/models.ts      Data types, repositories, and schemaVersion
src/data/seed.ts        Demo data
src/data/store.ts       The on-device data store (AsyncStorage)
src/components/         Buttons, cards, lists, text fields, and other building blocks
src/theme/              Colors, spacing, and type sizes
```

## Data and demo records

Everything is stored on the device with AsyncStorage; there is no server. The first launch runs `seed()` from `src/data/seed.ts`, which creates demo records marked `isDemo: true`, and the first tab shows a **Demo data** label while any exist. Delete them in the app, or change `seed.ts` to start empty.

`src/data/models.ts` exports a `schemaVersion`. When you change the shape of a model (add, remove, rename, or retype a field, or add a collection), increase `schemaVersion` by one. On the next launch the app sees the new version, **clears its stored data, reseeds the demo data, and shows a one-time notice**. There are no migrations, so do not bump the version once real data matters to you; write a migration first.

## Make it yours

- App name and icon: `app.json` ([Expo config docs](https://docs.expo.dev/versions/latest/config/app/)).
- Colors and spacing: `src/theme/index.tsx`.
- Publish to the stores with [EAS Build](https://docs.expo.dev/build/introduction/).

The app does not depend on the service that generated it.
{{attribution}}
