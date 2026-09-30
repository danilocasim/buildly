# S4 checker speed spike

`foundation/` installs the SDK 54 dependency set from `packages/foundation/foundation.json`
(`npm install --ignore-scripts`; `electron-to-chromium` is overridden to 1.5.442 because
1.5.443's tarball 404'd minutes after publish). `fixture/` is a journal-like starter.
`bench.mjs` assembles the fixture into a temp dir with `node_modules` symlinked and times
`tsc --noEmit`.

```bash
cd foundation && npm install --no-audit --no-fund --ignore-scripts && cd ..
node bench.mjs --runs 5
# Railway-like limits (real Docker binary; /opt/homebrew/bin/docker on this Mac is not Docker):
docker run --rm --platform linux/amd64 --cpus=1 --memory=2g --memory-swap=2g -v "$PWD":/spike:ro \
  node:22-bookworm-slim sh -c "mkdir -p /deps && cp -a /spike/foundation/node_modules /deps/ && node /spike/bench.mjs --deps /deps"
```

Results in `results/`.
