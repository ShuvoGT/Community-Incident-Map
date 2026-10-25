import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../env";

// Shared Redis connection for the queue system. BullMQ requires
// maxRetriesPerRequest: null.
export const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
});

export const EVIDENCE_QUEUE = "evidence-processing";
export const AGGREGATE_QUEUE = "aggregate-refresh";

export const evidenceQueue = new Queue(EVIDENCE_QUEUE, { connection });
export const aggregateQueue = new Queue(AGGREGATE_QUEUE, { connection });

export type EvidenceJob = { evidenceId: string };

export async function enqueueEvidenceProcessing(evidenceId: string) {
  await evidenceQueue.add("process", { evidenceId } satisfies EvidenceJob, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: true,
  });
}
