#!/usr/bin/env bash
# Builds the Snack web player for the foundation's Expo SDK with Buildly's origins allowed.
#
#   SNACK_ALLOWED_ORIGINS="https://app.example.com,https://*.trycloudflare.com" pnpm --filter @buildly/web-player build
#
# Fetches expo/snack at SNACK_COMMIT (the last runtime commit on the foundation's SDK) into
# .cache/snack, applies patches/, installs with Yarn 1 (the runtime's lockfile), runs
# `expo export --platform web`, and writes dist/v2/<sdk major>/ plus BUILD.json. Needs Node 22
# and network access. The allowed origins are inlined at build time, so changing them is a
# rebuild and redeploy (README.md).
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
commit=${SNACK_COMMIT:-a694b8fafd0bcbdaa3741df4be7f48cafd18e6c6}
origins=${SNACK_ALLOWED_ORIGINS:?set SNACK_ALLOWED_ORIGINS: comma-separated origins; https://*.host allows subdomains}
cache=$here/.cache/snack
out=$here/dist
sdk=$(node -p "require('$here/../foundation/foundation.json').sdkVersion.split('.')[0]")

node_major=$(node -p "process.versions.node.split('.')[0]")
if [ "$node_major" != 22 ]; then
  echo "build.sh: Node 22 is required (found $node_major); try: nvm use 22" >&2
  exit 1
fi

if [ ! -d "$cache/.git" ]; then
  git clone --filter=blob:none --sparse --no-checkout https://github.com/expo/snack.git "$cache"
  git -C "$cache" sparse-checkout set runtime
fi
git -C "$cache" checkout -q --force "$commit"
git -C "$cache" clean -fdq runtime
for patch in "$here"/patches/*.patch; do git -C "$cache" apply "$patch"; done

cd "$cache/runtime"
runtime_sdk=$(node -p "require('./package.json').dependencies.expo.replace(/^[^0-9]*/, '').split('.')[0]")
if [ "$runtime_sdk" != "$sdk" ]; then
  echo "build.sh: the runtime at $commit targets SDK $runtime_sdk but foundation.json says $sdk; pick another SNACK_COMMIT" >&2
  exit 1
fi

# Yarn 1 would otherwise find Buildly's root package.json ("packageManager": "pnpm@…") above
# the cache and refuse to run.
export SKIP_YARN_COREPACK_CHECK=1
# Not --frozen-lockfile: patches/published-packages.patch swaps the three sibling packages
# from file: paths (which would need the whole monorepo built) to their published versions,
# so their lock entries change; every other dependency stays as yarn.lock pins it.
npx --yes yarn@1.22.22 install --non-interactive
rm -rf web-build
# EXPO_PUBLIC_SNACK_ENV must be production: the runtime's own .env says staging, and Expo
# keeps variables that are already set. EXPO_PROJECT_ID only feeds the (unused) updates URL.
EXPO_PROJECT_ID=00000000-0000-0000-0000-000000000000 \
EXPO_PUBLIC_SNACK_ENV=production \
EXPO_PUBLIC_SNACK_ALLOWED_ORIGINS="$origins" \
EXPO_NO_TELEMETRY=1 CI=1 \
  npx yarn expo export --platform web --output-dir web-build

rm -rf "$out"
mkdir -p "$out/v2/$sdk"
cp -R web-build/. "$out/v2/$sdk/"
node -e '
const [out, commit, origins, sdk] = process.argv.slice(1);
require("fs").writeFileSync(`${out}/v2/${sdk}/BUILD.json`, JSON.stringify({
  source: "https://github.com/expo/snack", commit, sdk: Number(sdk),
  allowedOrigins: origins.split(",").map((s) => s.trim()).filter(Boolean),
  builtAt: new Date().toISOString(),
}, null, 2) + "\n");
' "$out" "$commit" "$origins" "$sdk"
echo "built dist/v2/$sdk ($(du -sh "$out/v2/$sdk" | cut -f1)) from expo/snack@${commit:0:7}, origins: $origins"
