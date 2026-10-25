"use client";

import { useEffect, useState } from "react";

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

  if (loading) return <p>Loading…</p>;
  if (authRequired)
    return (
      <p>
        Please <a href="../login">sign in</a> to see your reports.
      </p>
    );
  if (rows.length === 0) return <p>You have no reports yet.</p>;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          <th>Date</th>
          <th>Category</th>
          <th>Area</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
            <td>{r.occurrenceDate}</td>
            <td>{r.category}</td>
            <td>{r.broadArea ?? "—"}</td>
            <td>{r.status}</td>
            <td>
              {r.status !== "withdrawn" && (
                <button className="btn secondary" type="button" onClick={() => withdraw(r.id)}>
                  Withdraw
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
