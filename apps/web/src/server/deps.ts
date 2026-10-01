// Everything a handler needs, injected so integration tests can supply a test database,
// a test bucket, a recording email sender, and a fixed clock.
import type pg from "pg";
import { createDb, createPool, type Db } from "@buildly/db";
import { createStorage, storageConfigFrom, type Storage } from "@buildly/storage";
import { loadWebConfig } from "../config";
import { emailSenderFor, type EmailSender } from "./email";
import type { RateLimiter } from "./rate-limit";

export interface Deps {
  db: Db;
  /** The pool behind `db`; the SSE stream LISTENs on a dedicated connection from it. */
  pool: pg.Pool;
  email: EmailSender;
  storage: Pick<
    Storage,
    | "getSnapshot"
    | "putSnapshot"
    | "delete"
    | "putExport"
    | "signedDownloadUrl"
    | "listKeys"
    | "getText"
  >;
  appUrl: string;
  /** Buildly's self-hosted Snack web player (D18), with %%SDK_VERSION%% for the SDK major. */
  webPlayerURL?: string;
  /** Per-session API limiter; defaults to the process-wide one (TODO 7.2.3). */
  rateLimiter?: RateLimiter;
  now(): Date;
}

let deps: Deps | undefined;

/** The process-wide dependencies, built from the validated environment on first use. */
export function getDeps(): Deps {
  if (!deps) {
    const config = loadWebConfig();
    const pool = createPool(config.DATABASE_URL);
    deps = {
      db: createDb(pool),
      pool,
      email: emailSenderFor(config),
      storage: createStorage(storageConfigFrom(config)),
      appUrl: config.APP_URL,
      webPlayerURL: config.SNACK_WEB_PLAYER_URL,
      now: () => new Date(),
    };
  }
  return deps;
}
