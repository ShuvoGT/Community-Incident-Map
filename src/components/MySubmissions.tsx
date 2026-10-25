"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Row = {
  id: string;
  category: string;
  status: string;
  occurrenceDate: string;
  broadArea: string | null;
  canonicalIncidentId: string | null;
};

// Reporter's private view of their own submissions, with withdrawal.
export function MySubmissions() {
  const t = useTranslations("me");
  const tl = useTranslations("labels");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/me/submissions");
    if (r.status === 401) {
      setAuthRequired(true);
      setLoading(false);
      return;
    }
    const d = await r.json();
    setRows(d.submissions ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function withdraw(id: string) {
    await fetch(`/api/me/submissions/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    load();
  }

  if (loading) return <p>{t("loading")}</p>;
  if (authRequired)
    return (
      <p>
        {t("signinPrompt")} <a href="../login">{t("signin")}</a>
      </p>
    );
  if (rows.length === 0) return <p>{t("empty")}</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          <th>{t("colDate")}</th>
          <th>{t("colCategory")}</th>
          <th>{t("colArea")}</th>
          <th>{t("colStatus")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
            <td>{r.occurrenceDate}</td>
            <td>{tl(`category.${r.category}`)}</td>
            <td>{r.broadArea ?? "—"}</td>
            <td>{r.status}</td>
            <td>
              {r.status !== "withdrawn" && (
                <button className="btn secondary" type="button" onClick={() => withdraw(r.id)}>
                  {t("withdraw")}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
