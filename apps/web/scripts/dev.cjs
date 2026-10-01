// `pnpm --filter @buildly/web dev`: loads the repo-root .env (if present) into this process,
// then runs `next dev`, which inherits it, as do the processes Next spawns. Next itself only
// reads a .env inside apps/web, and `--env-file` is refused through NODE_OPTIONS, which
// Next uses to re-spawn itself. Production platforms set real environment variables.
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const envFile = resolve(__dirname, "../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const next = resolve(__dirname, "../node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [next, "dev", "--port", process.env.PORT ?? "3300"], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
