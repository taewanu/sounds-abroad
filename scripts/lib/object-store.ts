import {
  CopyObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * How long a published object may be served from cache before it is
 * revalidated. The crawl republishes in place, so this bounds how stale a
 * reader can be between runs.
 */
const CACHE_MAX_AGE_SECONDS = 60;

const BUCKET = "sounds-abroad-charts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const REQUIRED_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
] as const;

/**
 * Fails before any work starts when the bucket is unreachable, so a long run
 * cannot get most of the way through and then die on its first upload.
 */
export function assertObjectStoreEnv(howToRun: string): void {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(`${missing.join(", ")} missing. ${howToRun}`);
  }
}

let client: S3Client | undefined;

/**
 * The bucket client, built once per process.
 *
 * Deferred rather than built at import time so a script that never uploads
 * (a dry run, a test importing a sibling export) does not require credentials
 * just to load this module.
 */
function objectStore(): S3Client {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${requireEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

/** The public URL a published object is served from. */
export function publicUrl(key: string): string {
  return `${requireEnv("R2_PUBLIC_BASE_URL").replace(/\/$/, "")}/${key}`;
}

/** Publishes a JSON document at `key`, overwriting whatever was there. */
export async function putJson(key: string, body: string): Promise<string> {
  await objectStore().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: "application/json",
      CacheControl: `max-age=${CACHE_MAX_AGE_SECONDS}`,
    }),
  );
  return publicUrl(key);
}

/** Copies an already-published object to a second key within the bucket. */
export async function copyObject(
  fromKey: string,
  toKey: string,
): Promise<string> {
  await objectStore().send(
    new CopyObjectCommand({
      Bucket: BUCKET,
      CopySource: `${BUCKET}/${fromKey}`,
      Key: toKey,
      ContentType: "application/json",
      MetadataDirective: "REPLACE",
      CacheControl: `max-age=${CACHE_MAX_AGE_SECONDS}`,
    }),
  );
  return publicUrl(toKey);
}
