"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Config = {
  rateLimits: Record<string, number>;
  retentionPolicy: Record<string, number>;
  ruleVersion: string;
  gridResolution: number;
  updatedAt: string;
};

export function AdminConsole() {
  const t = useTranslations("admin");
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
    setMsg(r.ok ? t("saved") : t("saveFailed"));
  }

  if (forbidden)
    return (
      <p>
        {t("forbidden")} <a href="../login">/login</a>.
      </p>
    );
  if (!config) return <p>{t("loading")}</p>;

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
        <legend>{t("rateLegend")}</legend>
        {numField("rateLimits", "submissionsPerContactPerDay", t("submissionsPerDay"))}
        {numField("rateLimits", "otpPerContactPerHour", t("otpPerHour"))}
        {numField("rateLimits", "ipPerMinute", t("ipPerMinute"))}
      </fieldset>

      <fieldset>
        <legend>{t("retentionLegend")}</legend>
        {numField("retentionPolicy", "rejectedAbandonedDays", t("rejectedDays"))}
        {numField("retentionPolicy", "evidenceNarrativeDays", t("evidenceDays"))}
        {numField("retentionPolicy", "publicIncidentMonths", t("publicMonths"))}
        {numField("retentionPolicy", "inactiveAccountMonths", t("inactiveMonths"))}
        {numField("retentionPolicy", "auditLogDays", t("auditDays"))}
      </fieldset>

      <fieldset>
        <legend>{t("methodologyLegend")}</legend>
        <label>
          {t("ruleVersion")}
          <input
            type="text"
            value={config.ruleVersion}
            onChange={(e) => setConfig({ ...config, ruleVersion: e.target.value })}
          />
        </label>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          {t("gridNote", {
            res: config.gridResolution,
            updated: new Date(config.updatedAt).toLocaleString(),
          })}
        </p>
      </fieldset>

      <button className="btn" type="button" onClick={save}>
        {t("save")}
      </button>
      {msg && <span className="notice" style={{ marginLeft: 12 }}>{msg}</span>}

      <fieldset style={{ marginTop: 24 }}>
        <legend>{t("exportLegend")}</legend>
        <p>{t("exportDesc")}</p>
        <div className="share">
          <a className="btn" href="/api/admin/exports?window=7">
            {t("downloadWeekly")}
          </a>
          <a className="btn secondary" href="/api/admin/exports?window=30">
            {t("download30")}
          </a>
        </div>
      </fieldset>

      <MfaSetup />
    </div>
  );
}

function MfaSetup() {
  const t = useTranslations("admin");
  const [uri, setUri] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");

  async function begin() {
    const r = await fetch("/api/admin/mfa/setup", { method: "POST" });
    if (!r.ok) {
      setStatus(t("mfaStartFailed"));
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
    setStatus(r.ok ? t("mfaEnabled") : t("mfaFailed"));
  }

  return (
    <fieldset style={{ marginTop: 24 }}>
      <legend>{t("mfaLegend")}</legend>
      {!uri ? (
        <button className="btn secondary" type="button" onClick={begin}>
          {t("mfaSetup")}
        </button>
      ) : (
        <div>
          <p>{t("mfaSecretPrompt")}</p>
          <p>
            <code>{secret}</code>
          </p>
          <p style={{ wordBreak: "break-all", color: "var(--muted)", fontSize: "0.8rem" }}>
            {uri}
          </p>
          <label>
            {t("enterCode")}
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="btn" type="button" onClick={enable} disabled={code.length !== 6}>
            {t("enable")}
          </button>
        </div>
      )}
      {status && <p className="notice">{status}</p>}
    </fieldset>
  );
}
