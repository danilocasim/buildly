// Everything a handler needs, injected so integration tests can supply a test database,
// a recording email sender, and a fixed clock.
import { createDb, createPool, type Db } from "@buildly/db";
import { loadWebConfig } from "../config";
import { emailSenderFor, type EmailSender } from "./email";

export interface Deps {
  db: Db;
  email: EmailSender;
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
      appUrl: config.APP_URL,
      now: () => new Date(),
    };
  }
  return deps;
}
