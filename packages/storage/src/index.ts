// Object storage for snapshots and export ZIPs (HOSTING.md §3). AWS S3 in staging and
// production; the docker-compose S3 server locally (STORAGE_ENDPOINT set).
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StorageConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Unset for AWS S3; the local S3 server's URL in development and tests. */
  endpoint?: string;
}

/** A project's files: POSIX path → UTF-8 contents. */
export type SnapshotFiles = Record<string, string>;

export const snapshotKey = (projectId: string, snapshotId: string) =>
  `snapshots/${projectId}/${snapshotId}.json`;
export const exportKey = (projectId: string, exportId: string) =>
  `exports/${projectId}/${exportId}.zip`;

export interface Storage {
  readonly bucket: string;
  putSnapshot(key: string, files: SnapshotFiles): Promise<void>;
  getSnapshot(key: string): Promise<SnapshotFiles>;
  putExport(key: string, zip: Uint8Array): Promise<void>;
  /** A GET URL that works without credentials for `ttlSeconds`. */
  signedDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
  /** Keys under `prefix`, sorted; e.g. the nightly eval reports (`eval/nightly/`). */
  listKeys(prefix: string): Promise<string[]>;
  /** A small UTF-8 object, e.g. an eval report JSON. */
  getText(key: string): Promise<string>;
  /** Creates the bucket if missing. For local development and tests only. */
  ensureBucket(): Promise<void>;
}

export function createS3Client(config: StorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
  });
}

export function createStorage(
  config: StorageConfig,
  client: S3Client = createS3Client(config),
): Storage {
  const { bucket } = config;
  return {
    bucket,
    async putSnapshot(key, files) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify({ files }),
          ContentType: "application/json; charset=utf-8",
        }),
      );
    },
    async getSnapshot(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const text = await response.Body!.transformToString("utf-8");
      const parsed = JSON.parse(text) as { files?: unknown };
      if (!parsed.files || typeof parsed.files !== "object")
        throw new Error(`Snapshot ${key} has no files`);
      return parsed.files as SnapshotFiles;
    },
    async putExport(key, zip) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: zip,
          ContentType: "application/zip",
        }),
      );
    },
    async signedDownloadUrl(key, ttlSeconds) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
        expiresIn: ttlSeconds,
      });
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async listKeys(prefix) {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return keys.sort();
    },
    async getText(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return response.Body!.transformToString("utf-8");
    },
    async ensureBucket() {
      try {
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    },
  };
}

/** Maps the validated server config (`loadConfig`) to a storage config. */
export function storageConfigFrom(env: {
  STORAGE_REGION: string;
  STORAGE_BUCKET: string;
  STORAGE_ACCESS_KEY: string;
  STORAGE_SECRET_KEY: string;
  STORAGE_ENDPOINT?: string;
}): StorageConfig {
  return {
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKeyId: env.STORAGE_ACCESS_KEY,
    secretAccessKey: env.STORAGE_SECRET_KEY,
    endpoint: env.STORAGE_ENDPOINT,
  };
}
