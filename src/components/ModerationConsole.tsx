"use client";

import { useEffect, useState } from "react";

type QueueItem = {
  id: string;
  category: string;
  relationship: string;
  status: string;
  occurrenceDate: string;
  broadArea: string | null;
  weaponReported: boolean | null;
  injury: string | null;
};

type Detail = {
  submission: {
    id: string;
    category: string;
    experience: string;
    occurrenceDate: string;
    occurrenceTime: string | null;
    cellId: string | null;
    broadArea: string | null;
    weaponReported: boolean | null;
    injury: string | null;
    version: number;
  };
  evidence: { id: string; fileType: string; scanStatus: string; downloadUrl: string | null }[];
};

// Moderator review console: queue → private detail → publish (with a redacted
// narrative) or reject / request clarification.
export function ModerationConsole() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [redacted, setRedacted] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const [forbidden, setForbidden] = useState(false);

  async function loadQueue() {
    const r = await fetch("/api/admin/queue");
    if (r.status === 401 || r.status === 403) {
      setForbidden(true);
      return;
    }
    const d = await r.json();
    setQueue(d.queue ?? []);
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function open(id: string) {
    setMsg("");
    setRedacted("");
    const r = await fetch(`/api/admin/submissions/${id}`);
    const d = await r.json();
    setDetail(d);
  }

  async function act(body: Record<string, unknown>) {
    if (!detail) return;
    const r = await fetch(`/api/admin/reviews/${detail.submission.id}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, expectedVersion: detail.submission.version }),
    });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? "Done." : (d.error ?? "Action failed"));
    if (r.ok) {
      setDetail(null);
      loadQueue();
    }
  }

  if (forbidden)
    return (
      <p>
        Moderator access required. Sign in with a staff account at{" "}
        <a href="../login">/login</a>.
      </p>
    );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
      <div>
        <h2>Queue ({queue.length})</h2>
        {queue.map((q) => (
          <button
            key={q.id}
            className="btn secondary"
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}
            onClick={() => open(q.id)}
          >
            {q.occurrenceDate} · {q.category}
            {q.weaponReported ? " · ⚠ weapon" : ""}
          </button>
        ))}
        {queue.length === 0 && <p>Nothing awaiting review.</p>}
      </div>

      <div>
        {!detail ? (
          <p>Select a submission to review.</p>
        ) : (
          <div>
            <h2>Review</h2>
            <p>
              <strong>Category:</strong> {detail.submission.category} ·{" "}
              <strong>Date:</strong> {detail.submission.occurrenceDate}{" "}
              {detail.submission.occurrenceTime ?? ""}
            </p>
            <p>
              <strong>Cell:</strong> {detail.submission.cellId ?? "broad area only"} ·{" "}
              <strong>Area:</strong> {detail.submission.broadArea ?? "—"}
            </p>
            <p>
              <strong>Weapon:</strong> {String(detail.submission.weaponReported)} ·{" "}
              <strong>Injury:</strong> {detail.submission.injury ?? "—"}
            </p>
            <fieldset>
              <legend>Original (private) account</legend>
              <p>{detail.submission.experience}</p>
            </fieldset>

            {detail.evidence.length > 0 && (
              <fieldset>
                <legend>Evidence</legend>
                {detail.evidence.map((e) => (
                  <div key={e.id}>
                    {e.fileType} — {e.scanStatus}{" "}
                    {e.downloadUrl && (
                      <a href={e.downloadUrl} target="_blank" rel="noreferrer">
                        view
                      </a>
                    )}
                  </div>
                ))}
              </fieldset>
            )}

            <fieldset>
              <legend>Redacted public narrative</legend>
              <textarea
                rows={5}
                value={redacted}
                onChange={(e) => setRedacted(e.target.value)}
                placeholder="Write the redacted version that will be published. No names, faces, vehicle numbers or addresses."
              />
              <button
                className="btn"
                type="button"
                onClick={() => act({ action: "publish", redactedNarrative: redacted })}
                disabled={redacted.trim().length < 10}
              >
                Publish
              </button>
            </fieldset>

            <fieldset>
              <legend>Reject / request clarification</legend>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (shown privately to the reporter)"
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => act({ action: "needs_clarification", reason })}
                  disabled={reason.trim().length < 3}
                >
                  Needs clarification
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => act({ action: "reject", reason })}
                  disabled={reason.trim().length < 3}
                >
                  Reject
                </button>
              </div>
            </fieldset>

            {msg && <p className="notice">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
