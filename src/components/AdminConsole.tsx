"use client";

import { useEffect, useState } from "react";

type Config = {
  rateLimits: Record<string, number>;
  retentionPolicy: Record<string, number>;
  ruleVersion: string;
  gridResolution: number;
  updatedAt: string;
};

export function AdminConsole() {
  const [config, setConfig] = useState<Config | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    const r = await fetch("/api/admin/config");
    if (r.status === 401 || r.status === 403) {
      setForbidden(true);
      return;
    }
    setConfig((await r.json()).config);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!config) return;
    const r = await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rateLimits: config.rateLimits,
        retentionPolicy: config.retentionPolicy,
        ruleVersion: config.ruleVersion,
      }),
    });
    setMsg(r.ok ? "Saved." : "Save failed.");
  }

  if (forbidden)
    return (
      <p>
        Administrator access required. Sign in with an admin account at{" "}
        <a href="../login">/login</a>.
      </p>
    );
  if (!config) return <p>Loading…</p>;

  const numField = (
    group: "rateLimits" | "retentionPolicy",
    key: string,
    label: string,
  ) => (
    <label key={key}>
      {label}
      <input
        type="number"
        value={config[group][key] ?? 0}
        onChange={(e) =>
          setConfig({
            ...config,
            [group]: { ...config[group], [key]: Number(e.target.value) },
          })
        }
      />
    </label>
  );

  return (
    <div>
      <fieldset>
        <legend>Rate limits &amp; abuse controls</legend>
        {numField("rateLimits", "submissionsPerContactPerDay", "Submissions per verified contact / day")}
        {numField("rateLimits", "otpPerContactPerHour", "OTP requests per contact / hour")}
        {numField("rateLimits", "ipPerMinute", "Requests per IP / minute")}
      </fieldset>

      <fieldset>
        <legend>Retention (days / months)</legend>
        {numField("retentionPolicy", "rejectedAbandonedDays", "Rejected / abandoned (days)")}
        {numField("retentionPolicy", "evidenceNarrativeDays", "Evidence + original narrative (days)")}
        {numField("retentionPolicy", "publicIncidentMonths", "Public incidents (months)")}
        {numField("retentionPolicy", "inactiveAccountMonths", "Inactive accounts (months)")}
        {numField("retentionPolicy", "auditLogDays", "Audit logs (days)")}
      </fieldset>

      <fieldset>
        <legend>Methodology</legend>
        <label>
          Rule version
          <input
            type="text"
            value={config.ruleVersion}
            onChange={(e) => setConfig({ ...config, ruleVersion: e.target.value })}
          />
        </label>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          Grid resolution: H3 r{config.gridResolution}. Last updated{" "}
          {new Date(config.updatedAt).toLocaleString()}.
        </p>
      </fieldset>

      <button className="btn" type="button" onClick={save}>
        Save configuration
      </button>
      {msg && <span className="notice" style={{ marginLeft: 12 }}>{msg}</span>}

      <fieldset style={{ marginTop: 24 }}>
        <legend>Authority export</legend>
        <p>Privacy-protected weekly aggregate CSV (deduplicated, no reporter data).</p>
        <div className="share">
          <a className="btn" href="/api/admin/exports?window=7">
            Download weekly CSV
          </a>
          <a className="btn secondary" href="/api/admin/exports?window=30">
            Download 30-day CSV
          </a>
        </div>
      </fieldset>

      <MfaSetup />
    </div>
  );
}

function MfaSetup() {
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");

  async function begin() {
    const r = await fetch("/api/admin/mfa/setup", { method: "POST" });
    if (!r.ok) {
      setStatus("Could not start MFA setup.");
      return;
    }
    const d = await r.json();
    setUri(d.otpauthUrl);
    setSecret(d.secret);
  }

  async function enable() {
    const r = await fetch("/api/admin/mfa/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, code }),
    });
    setStatus(r.ok ? "Two-factor enabled." : "Code did not verify.");
  }

  return (
    <fieldset style={{ marginTop: 24 }}>
      <legend>Two-factor authentication (staff)</legend>
      {!uri ? (
        <button className="btn secondary" type="button" onClick={begin}>
          Set up two-factor
        </button>
      ) : (
        <div>
          <p>Add this secret to your authenticator app, then enter a code:</p>
          <p>
            <code>{secret}</code>
          </p>
          <p style={{ wordBreak: "break-all", color: "var(--muted)", fontSize: "0.8rem" }}>
            {uri}
          </p>
          <label>
            6-digit code
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="btn" type="button" onClick={enable} disabled={code.length !== 6}>
            Enable
          </button>
        </div>
      )}
      {status && <p className="notice">{status}</p>}
    </fieldset>
  );
}
