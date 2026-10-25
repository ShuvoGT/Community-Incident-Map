"use client";

import { useState } from "react";

// Reusable contact-verification widget. Requests a one-time code, then
// confirms it; on success a session cookie is set by the API and onVerified
// fires. In development the code is printed to the server console.
export function VerifyPanel({ onVerified }: { onVerified: () => void }) {
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

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
      setMsg("Code sent. In development, check the server console.");
    } catch {
      setMsg("Could not send a code. Check the email and try again.");
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
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? "Verification failed");
      }
      onVerified();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset>
      <legend>Verify your contact</legend>
      <label>
        Email
        <input
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      {!sent ? (
        <button className="btn" type="button" onClick={sendCode} disabled={busy || !contact}>
          Send code
        </button>
      ) : (
        <>
          <label>
            6-digit code
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          <button className="btn" type="button" onClick={confirm} disabled={busy || code.length !== 6}>
            Verify
          </button>
        </>
      )}
      {msg && <p className="notice">{msg}</p>}
    </fieldset>
  );
}
