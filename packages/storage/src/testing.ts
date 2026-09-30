// A throwaway bucket on the docker-compose S3 server (`pnpm services:up`).
import { randomBytes } from "node:crypto";
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { createS3Client, createStorage, type Storage, type StorageConfig } from "./index";

export const LOCAL_S3: Omit<StorageConfig, "bucket"> = {
  region: "us-east-1",
  endpoint: process.env.TEST_STORAGE_ENDPOINT ?? "http://localhost:9000",
  accessKeyId: "buildly-dev",
  secretAccessKey: "buildly-dev-secret",
};

export async function createTestStorage(): Promise<{
  storage: Storage;
  config: StorageConfig;
  cleanup(): Promise<void>;
}> {
  const config = { ...LOCAL_S3, bucket: `buildly-test-${randomBytes(5).toString("hex")}` };
  const client = createS3Client(config);
  const storage = createStorage(config, client);
  try {
    await storage.ensureBucket();
  } catch (error) {
    throw new Error(
      `Integration tests need the S3 server at ${config.endpoint}. Start it with \`pnpm services:up\`.`,
      { cause: error },
    );
  }
  return {
    storage,
    config,
    async cleanup() {
      for (;;) {
        const listed = await client.send(new ListObjectsV2Command({ Bucket: config.bucket }));
        const keys = (listed.Contents ?? []).map((o) => ({ Key: o.Key! }));
        if (keys.length === 0) break;
        await client.send(
          new DeleteObjectsCommand({ Bucket: config.bucket, Delete: { Objects: keys } }),
        );
      }
      await client.send(new DeleteBucketCommand({ Bucket: config.bucket }));
      client.destroy();
    },
  };
}
