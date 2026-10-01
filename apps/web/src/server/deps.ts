// Everything a handler needs, injected so integration tests can supply a test database,
// a test bucket, a recording email sender, and a fixed clock.
import { createDb, createPool, type Db } from "@buildly/db";
import { createStorage, storageConfigFrom, type Storage } from "@buildly/storage";
import { loadWebConfig } from "../config";
import { emailSenderFor, type EmailSender } from "./email";

export interface Deps {
  db: Db;
  email: EmailSender;
  storage: Pick<Storage, "getSnapshot" | "putSnapshot" | "delete">;
  appUrl: string;
  now(): Date;
}

let deps: Deps | undefined;

/** The process-wide dependencies, built from the validated environment on first use. */
export function getDeps(): Deps {
  if (!deps) {
    const config = loadWebConfig();
    deps = {
      db: createDb(createPool(config.DATABASE_URL)),
      email: emailSenderFor(config),
      storage: createStorage(storageConfigFrom(config)),
      appUrl: config.APP_URL,
      now: () => new Date(),
    };
  }
  return deps;
}
