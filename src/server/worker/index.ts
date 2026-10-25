import "dotenv/config";
import { Worker } from "bullmq";
import { processEvidence } from "../services/evidence";
import { recomputeAllWindows } from "../services/aggregates";
import { runRetention } from "../services/retention";
import {
  connection,
  EVIDENCE_QUEUE,
  AGGREGATE_QUEUE,
  RETENTION_QUEUE,
  aggregateQueue,
  retentionQueue,
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
    const result = await processEvidence(job.data.evidenceId);
    console.info(`[worker] evidence ${job.data.evidenceId}: ${result}`);
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

// Retention: apply the configured deletion policy once a day.
const retentionWorker = new Worker(
  RETENTION_QUEUE,
  async () => {
    const summary = await runRetention();
    console.info("[worker] retention run:", JSON.stringify(summary));
  },
  { connection },
);

retentionWorker.on("failed", (job, err) => {
  console.error(`[worker] retention job ${job?.id} failed:`, err.message);
});

async function scheduleRepeats() {
  await aggregateQueue.add(
    "refresh",
    {},
    { repeat: { every: 15 * 60_000 }, removeOnComplete: true, removeOnFail: true },
  );
  await retentionQueue.add(
    "run",
    {},
    { repeat: { every: 24 * 60 * 60_000 }, removeOnComplete: true, removeOnFail: true },
  );
}

scheduleRepeats().then(
  () =>
    console.info(
      "[worker] started: evidence-processing + aggregate-refresh + retention",
    ),
  (err) => console.error("[worker] failed to schedule repeats:", err),
);
