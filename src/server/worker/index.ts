import "dotenv/config";
import crypto from "node:crypto";
import { Worker } from "bullmq";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { evidence } from "../db/schema";
import {
  getEvidenceObject,
  putEvidenceObject,
  sniffType,
} from "../services/evidence";
import { recomputeAllWindows } from "../services/aggregates";
import {
  connection,
  EVIDENCE_QUEUE,
  AGGREGATE_QUEUE,
  aggregateQueue,
  type EvidenceJob,
} from "./queue";

/**
 * Background worker: evidence processing and the periodic aggregate refresh.
 * Run with `npm run worker` alongside the web app.
 */

// Evidence: validate the real file signature, strip metadata (re-encode
// images so EXIF is dropped), re-upload the sanitised bytes, and record the
// scan result. A full malware scanner (ClamAV) is wired in during hardening.
const evidenceWorker = new Worker<EvidenceJob>(
  EVIDENCE_QUEUE,
  async (job) => {
    const [row] = await db
      .select()
      .from(evidence)
      .where(eq(evidence.id, job.data.evidenceId))
      .limit(1);
    if (!row) return;

    const buf = await getEvidenceObject(row.objectKey);
    const actual = sniffType(buf);

    if (!actual || actual !== row.fileType) {
      await db
        .update(evidence)
        .set({ scanStatus: "infected" }) // signature mismatch / unsupported
        .where(eq(evidence.id, row.id));
      return;
    }

    let sanitised = buf;
    if (actual === "image/jpeg" || actual === "image/png") {
      sanitised = await sharp(buf).rotate().toBuffer(); // drops EXIF/metadata
    }
    await putEvidenceObject(row.objectKey, sanitised, actual);

    const checksum = crypto.createHash("sha256").update(sanitised).digest("hex");
    await db
      .update(evidence)
      .set({ scanStatus: "clean", metadataStripped: true, checksum })
      .where(eq(evidence.id, row.id));
  },
  { connection },
);

evidenceWorker.on("failed", (job, err) => {
  console.error(`[worker] evidence job ${job?.id} failed:`, err.message);
});

// Aggregate refresh runs on a 15-minute repeat (and can be triggered on
// moderation changes via the queue).
const aggregateWorker = new Worker(
  AGGREGATE_QUEUE,
  async () => {
    const n = await recomputeAllWindows();
    console.info(`[worker] refreshed aggregates for ${n} cell(s)`);
  },
  { connection },
);

aggregateWorker.on("failed", (job, err) => {
  console.error(`[worker] aggregate job ${job?.id} failed:`, err.message);
});

async function scheduleAggregateRefresh() {
  await aggregateQueue.add(
    "refresh",
    {},
    {
      repeat: { every: 15 * 60_000 },
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

scheduleAggregateRefresh().then(
  () => console.info("[worker] started: evidence-processing + aggregate-refresh"),
  (err) => console.error("[worker] failed to schedule refresh:", err),
);
