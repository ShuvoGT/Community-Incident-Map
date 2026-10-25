import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "../db";
import { evidence } from "../db/schema";
import { env } from "../env";
import { newPublicId } from "@/lib/ids";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED = new Set(["image/jpeg", "image/png", "application/pdf"]);

export class InvalidEvidenceError extends Error {}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: env.s3.endpoint,
      region: env.s3.region,
      forcePathStyle: true, // required for MinIO / path-style buckets
      credentials: {
        accessKeyId: env.s3.accessKey,
        secretAccessKey: env.s3.secretKey,
      },
    });
  }
  return client;
}

// Prepare a private evidence upload: validate, reserve an object key, record a
// pending row, and return a short-lived signed PUT URL. The object is never
// publicly reachable; the worker scans it and strips metadata afterwards.
export async function createEvidenceUpload(
  submissionId: string,
  fileType: string,
  size: number,
): Promise<{ evidenceId: string; uploadUrl: string; objectKey: string }> {
  if (!ALLOWED.has(fileType)) {
    throw new InvalidEvidenceError("Unsupported file type");
  }
  if (!Number.isInteger(size) || size <= 0 || size > MAX_SIZE) {
    throw new InvalidEvidenceError("File too large");
  }

  const objectKey = `submissions/${submissionId}/${newPublicId()}`;

  const [row] = await db
    .insert(evidence)
    .values({
      submissionId,
      objectKey,
      fileType,
      size,
      checksum: "",
      scanStatus: "pending",
      expiryAt: new Date(Date.now() + 90 * 24 * 60 * 60_000),
    })
    .returning({ id: evidence.id });

  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: objectKey,
      ContentType: fileType,
    }),
    { expiresIn: env.s3.signedUrlTtl },
  );

  return { evidenceId: row.id, uploadUrl, objectKey };
}

// Short-lived signed GET for a moderator to inspect private evidence. Access
// is logged by the caller.
export async function signedEvidenceDownload(objectKey: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: objectKey }),
    { expiresIn: env.s3.signedUrlTtl },
  );
}

// Raw object access for the background worker (scan + metadata strip).
export async function getEvidenceObject(objectKey: string): Promise<Buffer> {
  const res = await s3().send(
    new GetObjectCommand({ Bucket: env.s3.bucket, Key: objectKey }),
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

export async function putEvidenceObject(
  objectKey: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: env.s3.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );
}

// Magic-byte check: the declared type must match the actual file signature.
export function sniffType(buf: Buffer): "image/jpeg" | "image/png" | "application/pdf" | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") {
    return "application/pdf";
  }
  return null;
}
