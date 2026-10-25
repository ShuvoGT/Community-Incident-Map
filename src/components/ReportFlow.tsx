"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { VerifyPanel } from "./VerifyPanel";

type Category =
  | "robbery_force"
  | "snatching"
  | "pickpocketing"
  | "other_theft"
  | "attempted";

type Phase = "form" | "verify" | "done";

const CATEGORIES: Category[] = [
  "robbery_force",
  "snatching",
  "pickpocketing",
  "other_theft",
  "attempted",
];

// Stage 2 guided report flow: collect → verify contact → submit. The precise
// map pin selector replaces the lat/lng inputs in Stage 3.
export function ReportFlow() {
  const t = useTranslations("report");

  const [phase, setPhase] = useState<Phase>("form");
  const [category, setCategory] = useState<Category>("snatching");
  const [relationship, setRelationship] = useState<"victim" | "witness">("victim");
  const [precision, setPrecision] = useState<"street" | "area">("street");
  const [lat, setLat] = useState("23.7806");
  const [lng, setLng] = useState("90.4074");
  const [broadArea, setBroadArea] = useState("");
  const [occurrenceDate, setOccurrenceDate] = useState("");
  const [occurrenceTime, setOccurrenceTime] = useState("");
  const [experience, setExperience] = useState("");
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState("");
  const [resultId, setResultId] = useState("");

  const canContinue =
    experience.trim().length >= 30 &&
    consent &&
    occurrenceDate &&
    (precision === "area" ? broadArea.trim().length > 0 : lat && lng);

  async function submit() {
    setError("");
    const body = {
      category,
      relationship,
      locationPrecision: precision,
      ...(precision === "street"
        ? { lat: Number(lat), lng: Number(lng) }
        : { broadArea }),
      occurrenceDate,
      ...(occurrenceTime ? { occurrenceTime } : {}),
      timePrecision: occurrenceTime ? "exact" : "unknown",
      experience,
      consent: true,
    };
    const r = await fetch("/api/submissions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? t("submitError"));
      setPhase("form");
      return;
    }
    const d = await r.json();
    setResultId(d.id);
    setPhase("done");
  }

  if (phase === "done") {
    return (
      <div className="notice">
        <h2>{t("receiptTitle")}</h2>
        <p>{t("receiptBody")}</p>
        <p>
          {t("privateRef")} <code>{resultId}</code>
        </p>
        <p>
          <a className="btn" href="../me">
            {t("trackReport")}
          </a>
        </p>
      </div>
    );
  }

  if (phase === "verify") {
    return (
      <div>
        <p>{t("intro")}</p>
        <VerifyPanel onVerified={submit} />
        <button className="btn secondary" type="button" onClick={() => setPhase("form")}>
          {t("back")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setPhase("verify");
      }}
    >
      {error && <div className="notice warn">{error}</div>}

      <fieldset>
        <legend>{t("steps.category")}</legend>
        {CATEGORIES.map((c) => (
          <label key={c}>
            <input
              type="radio"
              name="category"
              checked={category === c}
              onChange={() => setCategory(c)}
            />{" "}
            {t(`category.${c}`)}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>{t("steps.relationship")}</legend>
        <label>
          <input
            type="radio"
            name="relationship"
            checked={relationship === "victim"}
            onChange={() => setRelationship("victim")}
          />{" "}
          {t("relationship.victim")}
        </label>
        <label>
          <input
            type="radio"
            name="relationship"
            checked={relationship === "witness"}
            onChange={() => setRelationship("witness")}
          />{" "}
          {t("relationship.witness")}
        </label>
      </fieldset>

      <fieldset>
        <legend>{t("steps.location")}</legend>
        <label>
          <input
            type="radio"
            name="precision"
            checked={precision === "street"}
            onChange={() => setPrecision("street")}
          />{" "}
          {t("locationPoint")}
        </label>
        {precision === "street" && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder={t("latPlaceholder")}
            />
            <input
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder={t("lngPlaceholder")}
            />
          </div>
        )}
        <label>
          <input
            type="radio"
            name="precision"
            checked={precision === "area"}
            onChange={() => setPrecision("area")}
          />{" "}
          {t("locationArea")}
        </label>
        {precision === "area" && (
          <input
            value={broadArea}
            onChange={(e) => setBroadArea(e.target.value)}
            placeholder={t("areaPlaceholder")}
          />
        )}
      </fieldset>

      <fieldset>
        <legend>{t("steps.datetime")}</legend>
        <label>
          {t("dateLabel")}
          <input
            type="date"
            value={occurrenceDate}
            onChange={(e) => setOccurrenceDate(e.target.value)}
          />
        </label>
        <label>
          {t("timeLabel")}
          <input
            type="time"
            value={occurrenceTime}
            onChange={(e) => setOccurrenceTime(e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>{t("steps.experience")}</legend>
        <textarea
          rows={6}
          minLength={30}
          maxLength={2000}
          value={experience}
          onChange={(e) => setExperience(e.target.value)}
          placeholder={t("experienceHint")}
        />
        <small>{t("charCount", { count: experience.trim().length })}</small>
      </fieldset>

      <fieldset>
        <legend>{t("steps.consent")}</legend>
        <label>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          {t("consentLabel")}
        </label>
      </fieldset>

      <button className="btn" type="submit" disabled={!canContinue}>
        {t("continue")}
      </button>
    </form>
  );
}
