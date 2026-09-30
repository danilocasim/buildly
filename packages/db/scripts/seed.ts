// pnpm db:seed — local development data on the docker-compose services. Uses the local
// defaults unless DATABASE_URL / STORAGE_* are set in the shell (it does not read .env).
import { loadStarterFiles, readStarters } from "@buildly/starters";
import { createStorage } from "@buildly/storage";
import { createDb, createPool } from "../src/client";
import { seedDev } from "../src/seed";

const pool = createPool(
  process.env.DATABASE_URL ?? "postgres://buildly:buildly@localhost:5433/buildly",
  2,
);
const storage = createStorage({
  region: process.env.STORAGE_REGION ?? "us-east-1",
  bucket: process.env.STORAGE_BUCKET ?? "buildly-dev",
  accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "buildly-dev",
  secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "buildly-dev-secret",
  endpoint: process.env.STORAGE_ENDPOINT ?? "http://localhost:9000",
});
try {
  await storage.ensureBucket();
  const starters = readStarters().map((s) => ({
    slug: s.slug,
    name: s.name,
    files: loadStarterFiles(s.slug),
  }));
  await seedDev(createDb(pool), storage, starters);
  console.log(`seeded: admin, ${starters.length} starter projects, invites`);
} finally {
  await pool.end();
}
