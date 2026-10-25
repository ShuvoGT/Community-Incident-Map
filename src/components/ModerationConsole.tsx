"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("moderate");
  const tl = useTranslations("labels");
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
    setMsg(r.ok ? t("done") : (d.error ?? t("actionFailed")));
    if (r.ok) {
      setDetail(null);
      loadQueue();
    }
  }

  if (forbidden)
    return (
      <p>
        {t("forbidden")} <a href="../login">/login</a>.
      </p>
    );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 24 }}>
      <div>
        <h2>{t("queue", { count: queue.length })}</h2>
        {queue.map((q) => (
          <button
            key={q.id}
            className="btn secondary"
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 8 }}
            onClick={() => open(q.id)}
          >
            {q.occurrenceDate} · {tl(`category.${q.category}`)}
            {q.weaponReported ? " · ⚠" : ""}
          </button>
        ))}
        {queue.length === 0 && <p>{t("nothing")}</p>}
      </div>

      <div>
        {!detail ? (
          <p>{t("selectPrompt")}</p>
        ) : (
          <div>
            <h2>{t("review")}</h2>
            <p>
              <strong>{t("category")}:</strong>{" "}
              {tl(`category.${detail.submission.category}`)} ·{" "}
              <strong>{t("date")}:</strong> {detail.submission.occurrenceDate}{" "}
              {detail.submission.occurrenceTime ?? ""}
            </p>
            <p>
              <strong>{t("cell")}:</strong>{" "}
              {detail.submission.cellId ?? t("broadAreaOnly")} ·{" "}
              <strong>{t("area")}:</strong> {detail.submission.broadArea ?? "—"}
            </p>
            <p>
              <strong>{t("weapon")}:</strong> {String(detail.submission.weaponReported)} ·{" "}
              <strong>{t("injury")}:</strong> {detail.submission.injury ?? "—"}
            </p>
            <fieldset>
              <legend>{t("originalAccount")}</legend>
              <p>{detail.submission.experience}</p>
            </fieldset>

            {detail.evidence.length > 0 && (
              <fieldset>
                <legend>{t("evidence")}</legend>
                {detail.evidence.map((e) => (
                  <div key={e.id}>
                    {e.fileType} — {e.scanStatus}{" "}
                    {e.downloadUrl && (
                      <a href={e.downloadUrl} target="_blank" rel="noreferrer">
                        {t("view")}
                      </a>
                    )}
                  </div>
                ))}
              </fieldset>
            )}

            <fieldset>
              <legend>{t("redactedLegend")}</legend>
              <textarea
                rows={5}
                value={redacted}
                onChange={(e) => setRedacted(e.target.value)}
                placeholder={t("redactedPlaceholder")}
              />
              <button
                className="btn"
                type="button"
                onClick={() => act({ action: "publish", redactedNarrative: redacted })}
                disabled={redacted.trim().length < 10}
              >
                {t("publish")}
              </button>
            </fieldset>

            <fieldset>
              <legend>{t("rejectLegend")}</legend>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("reasonPlaceholder")}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => act({ action: "needs_clarification", reason })}
                  disabled={reason.trim().length < 3}
                >
                  {t("needsClarification")}
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => act({ action: "reject", reason })}
                  disabled={reason.trim().length < 3}
                >
                  {t("reject")}
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
