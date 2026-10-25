// Centralised environment access. Reads are lazy so the app can boot in dev
// with only a subset configured; production requires the security-critical
// values (enforced below).

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Missing required env var: ${name}`);
    }
    return "";
  }
  return v;
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  timezone: process.env.APP_TIMEZONE ?? "Asia/Dhaka",

  contactEncryptionKey: () => required("CONTACT_ENCRYPTION_KEY"),
  verificationChannel: (process.env.VERIFICATION_CHANNEL ?? "email") as
    | "email"
    | "sms",

  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    bucket: process.env.S3_BUCKET ?? "incident-evidence",
    accessKey: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    signedUrlTtl: Number(process.env.S3_SIGNED_URL_TTL ?? "120"),
  },
};
