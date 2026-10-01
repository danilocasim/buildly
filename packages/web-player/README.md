# @buildly/web-player

Buildly's build of the Snack web player (DECISIONS.md D18, TODO 4b.0.1). Expo's hosted player (`snack-runtime.eascdn.net`) only talks to a hardcoded list of origins (SPIKES.md S1), so Buildly builds the same open-source runtime (expo/snack, MIT, `runtime/`, web target) with its own origins allowed and serves it from its own domain. `snack-sdk` gets it as `webPlayerURL` and loads `<webPlayerURL>/index.html?initialUrl=…&origin=<page origin>` in the preview iframe. Expo Go keeps using Snack's own runtime.

The player runs generated code in the user's browser, so it lives on a separate registrable domain (never the app's), without cookies. The workspace page's CSP allows only that origin for `frame-src` (ARCHITECTURE.md §8).

## What is in here

- `patches/allowed-origins.patch`: replaces the runtime's hardcoded `allowedOrigins` with `EXPO_PUBLIC_SNACK_ALLOWED_ORIGINS`, read at build time (Metro inlines it). Entries are exact origins or `https://*.example.com` for any subdomain (never the apex). `http://localhost:*` stays allowed for development, as upstream.
- `src/origins.ts`: the same matcher, so it can be unit-tested here; a test checks the patch and this copy stay equal.
- `build.sh`: fetches expo/snack at the pinned commit into `.cache/snack` (gitignored), applies the patches, installs with Yarn 1, runs `expo export --platform web`, and writes `dist/v2/<sdk major>/` (the layout `snack-sdk` expects) plus a `BUILD.json` recording the commit and origins.

## Build

Needs Node 22 (`nvm use 22`) and network access; the first run installs the runtime's dependencies (several minutes).

```bash
SNACK_ALLOWED_ORIGINS="https://app.<domain>,https://staging.<domain>" pnpm --filter @buildly/web-player build
```

The origins are inlined, so changing them means a rebuild and a redeploy. Until the product domain exists, the staging deploy allows `https://*.trycloudflare.com` (the quick tunnels the S1 spike page runs on); replace that with the real origins when the domain is registered (HOSTING.md).

## Deploy

Static files, one folder per SDK: `dist/v2/54/` is served at `https://<player domain>/v2/54/`. Hosting is AWS S3 + CloudFront (chosen in TODO 4b.0.1): a private bucket behind a CloudFront distribution with origin access control, no cookies. See `deploy.sh`. Keep earlier `v2/<sdk>/` folders while sessions on that SDK can still exist.

Pass the distribution's URL to the apps as `SNACK_WEB_PLAYER_URL=https://<player domain>/v2/%%SDK_VERSION%%` (`snack-sdk` substitutes the SDK major).

## Rebuilding for a new Expo SDK

When `packages/foundation/foundation.json` moves to a new `sdkVersion` (SPIKES.md S2 again):

1. In a clone of expo/snack, find the last `runtime` commit on that SDK: `git log --format='%h %cs %s' -- runtime/package.json` and pick the newest commit whose `runtime/package.json` has `"expo": "~<sdk>.x"`. Upstream moves `main` to the next SDK, so it is usually not `main`.
2. Set `SNACK_COMMIT=<that commit>` and run the build. `build.sh` refuses a commit whose runtime SDK differs from `foundation.json`.
3. If `git apply` fails, upstream changed `runtime/src/transports/RuntimeTransportImplWebPlayer.ts`: re-create the patch against the new file (same three functions as `src/origins.ts`) and run the tests, which compare the two.
4. Deploy `dist/v2/<new sdk>/` next to the old folder; `snack-sdk` picks the folder by SDK major.
5. Update `SNACK_COMMIT`'s default in `build.sh` and note the date in TODO 4b.0.1.

Upstream tracking: this started from commit `a694b8f` (2026-01-27, "upgrade Snack to latest SDK 54"), the last SDK 54 state of the runtime.
