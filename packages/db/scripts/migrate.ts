// pnpm db:migrate        apply every pending migration
// pnpm db:migrate:down   revert the newest applied migration
import { createPool } from "../src/client";
import { migrateDown, migrateUp } from "../src/migrate";

const url = process.env.DATABASE_URL ?? "postgres://buildly:buildly@localhost:5433/buildly";
const pool = createPool(url, 1);
try {
  if (process.argv[2] === "down") {
    const tag = await migrateDown(pool);
    console.log(tag ? `reverted ${tag}` : "nothing to revert");
  } else {
    await migrateUp(pool);
    console.log("migrations applied");
  }
} finally {
  await pool.end();
}
