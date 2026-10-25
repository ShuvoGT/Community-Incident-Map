"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Reusable contact-verification widget. Requests a one-time code, then
// confirms it; on success a session cookie is set by the API and onVerified
// fires. In development the code is printed to the server console.
export function VerifyPanel({ onVerified }: { onVerified: () => void }) {
  const t = useTranslations("verify");
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  async function sendCode() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/verify/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact, contactType: "email" }),
      });
      if (!r.ok) throw new Error();
      setSent(true);
      setMsg(t("codeSent"));
    } catch {
      setMsg(t("sendFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/verify/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact, contactType: "email", code }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? t("failed"));
      if (d.mfaRequired) {
        setMfaRequired(true);
        setMsg(t("mfaPrompt"));
        return;
      }
      onVerified();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmMfa() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/verify/mfa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      if (!r.ok) throw new Error(t("invalidCode"));
      onVerified();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("invalidCode"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset>
      <legend>{t("legend")}</legend>
      {mfaRequired ? (
        <>
          <label>
            {t("mfaCode")}
            <input
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder={t("codePlaceholder")}
            />
          </label>
          <button
            className="btn"
            type="button"
            onClick={confirmMfa}
            disabled={busy || mfaCode.length !== 6}
          >
            {t("verifyCode")}
          </button>
        </>
      ) : (
        <>
          <label>
            {t("email")}
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={t("emailPlaceholder")}
              autoComplete="email"
            />
          </label>
          {!sent ? (
            <button className="btn" type="button" onClick={sendCode} disabled={busy || !contact}>
              {t("sendCode")}
            </button>
          ) : (
            <>
              <label>
                {t("code")}
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("codePlaceholder")}
                />
              </label>
              <button className="btn" type="button" onClick={confirm} disabled={busy || code.length !== 6}>
                {t("verify")}
              </button>
            </>
          )}
        </>
      )}
      {msg && <p className="notice">{msg}</p>}
    </fieldset>
  );
}
