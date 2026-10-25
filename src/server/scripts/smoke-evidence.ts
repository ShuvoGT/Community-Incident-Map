import "dotenv/config";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { accounts, submissions, evidence } from "../db/schema";
import { encryptContact, hashContact } from "../crypto";
import { createSubmission } from "../services/submissions";
import {
  createEvidenceUpload,
  processEvidence,
} from "../services/evidence";
import { dhakaToday } from "@/lib/time";

/**
 * Verify the private-evidence pipeline end-to-end against the running S3
 * storage: presign -> upload -> scan + metadata strip. Needs `docker compose
 * up -d s3`. Run: npm run smoke:evidence
 */
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.info(`  ✓ ${msg}`);
}

async function putToSignedUrl(url: string, body: Buffer, contentType: string) {
  const r = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "content-type": contentType },
  });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${await r.text()}`);
}

async function main() {
  const email = `evid-${Date.now()}@dev.test`;
  const [rep] = await db
    .insert(accounts)
    .values({
      contactEncrypted: encryptContact(email),
      contactHash: hashContact(email),
      contactType: "email",
      role: "reporter",
      verifiedAt: new Date(),
    })
    .returning({ id: accounts.id });

  const sub = await createSubmission(
    rep.id,
    {
      category: "snatching",
      relationship: "victim",
      locationPrecision: "street",
      lat: 23.7806,
      lng: 90.4074,
      occurrenceDate: dhakaToday(),
      timePrecision: "unknown",
      experience: "Evidence pipeline test submission that is at least thirty chars.",
      consent: true,
    },
    `evid-${Date.now()}`,
  );

  console.info("\n1) Valid image: presign -> upload -> scan + strip");
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const up = await createEvidenceUpload(sub.id, "image/png", png.length);
  assert(up.uploadUrl.startsWith("http"), "received a signed upload URL");
  await putToSignedUrl(up.uploadUrl, png, "image/png");
  const res = await processEvidence(up.evidenceId);
  assert(res === "clean", "valid PNG processed as clean");
  const [ev] = await db
    .select()
    .from(evidence)
    .where(eq(evidence.id, up.evidenceId))
    .limit(1);
  assert(ev.scanStatus === "clean", "scan status is clean");
  assert(ev.metadataStripped === true, "metadata marked stripped");
  assert(ev.checksum.length === 64, "sha-256 checksum recorded");

  console.info("\n2) Type mismatch (declared png, actual pdf) -> infected");
  const fakePdf = Buffer.from("%PDF-1.4 not really an image");
  const up2 = await createEvidenceUpload(sub.id, "image/png", fakePdf.length);
  await putToSignedUrl(up2.uploadUrl, fakePdf, "image/png");
  const res2 = await processEvidence(up2.evidenceId);
  assert(res2 === "infected", "signature mismatch flagged as infected");

  // Cleanup.
  await db.delete(evidence).where(eq(evidence.submissionId, sub.id));
  await db.delete(submissions).where(eq(submissions.id, sub.id));
  await db.delete(accounts).where(eq(accounts.id, rep.id));

  console.info("\n✅ Evidence pipeline verified");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("\n❌", err);
    process.exit(1);
  },
);
