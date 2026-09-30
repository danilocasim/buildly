import { z } from "zod";

// Shape of packages/foundation/foundation.json, the contract generated apps follow.
export const foundationManifestSchema = z.strictObject({
  $comment: z.string().optional(),
  sdkVersion: z.string().regex(/^\d+\.0\.0$/, "an Expo SDK version like 54.0.0"),
  resolvedWith: z.strictObject({
    spike: z.string(),
    snackSdk: z.string(),
    checkedAt: z.iso.date(),
  }),
  /** The dependency allowlist with pinned versions; equals the foundation's package.json dependencies. */
  dependencies: z.record(z.string().min(1), z.string().min(1)),
  layout: z.strictObject({
    /** Read-only files shipped with every app. */
    foundationFiles: z.array(z.string().min(1)).min(1),
    /** Project files of the bare template (a free-form prompt starts here). */
    templateFiles: z.array(z.string().min(1)).min(1),
    /** Globs the model may write. */
    writable: z.array(z.string().min(1)).min(1),
    /** Globs the model may read but never write. */
    readOnly: z.array(z.string().min(1)).min(1),
    /** Paths the model may never create or write. */
    forbidden: z.array(z.string().min(1)),
    /** Keys of app.json the model may change. */
    appJsonWritableKeys: z.array(z.string().min(1)),
    /** README template for exports ({{appName}}, {{sdkMajor}}, {{attribution}}). */
    exportReadme: z.string().min(1),
  }),
  smokeChecks: z
    .array(z.strictObject({ name: z.string().min(1), command: z.string().min(1) }))
    .min(1),
  schemaVersionRule: z.string().min(1),
});

export type FoundationManifest = z.infer<typeof foundationManifestSchema>;

// Shape of packages/starters/starters.json, read by the web app's starter cards.
export const starterManifestSchema = z
  .array(
    z.strictObject({
      slug: z.string().regex(/^[a-z][a-z0-9-]*$/),
      name: z.string().min(1),
      description: z.string().min(1),
      /** Path relative to packages/starters. */
      thumbnail: z.string().regex(/^thumbnails\/[a-z0-9-]+\.png$/),
      screens: z.array(z.string().min(1)).min(1),
      models: z.array(z.string().min(1)).min(1),
    }),
  )
  .min(1);

export type StarterManifest = z.infer<typeof starterManifestSchema>;
