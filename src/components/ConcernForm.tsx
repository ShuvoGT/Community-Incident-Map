"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// "Report a concern" about a published incident. Anonymous; a moderator
// reviews. Flagger identity is never collected or shown.
export function ConcernForm({ publicId }: { publicId: string }) {
  const t = useTranslations("concern");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState(false);

  if (sent) return <p className="notice">{t("thanks")}</p>;

  if (!open)
    return (
      <button className="btn secondary" type="button" onClick={() => setOpen(true)}>
        {t("report")}
      </button>
    );

  return (
    <div className="notice">
      <label>
        {t("prompt")}
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </label>
      <button
        className="btn"
        type="button"
        disabled={reason.trim().length < 3}
        onClick={async () => {
          await fetch(`/api/incidents/${publicId}/flags`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ reason }),
          });
          setSent(true);
        }}
      >
        {t("submit")}
      </button>
    </div>
  );
}
