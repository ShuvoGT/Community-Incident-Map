import { getTranslations } from "next-intl/server";

// Stage 1 static prototype of the guided report flow. No backend wiring yet:
// it lays out the steps and fields so the flow can be reviewed. Contact
// verification, validation, idempotency and private storage come in Stage 2.
export default async function ReportPage() {
  const t = await getTranslations("report");

  const categories = [
    "robbery_force",
    "snatching",
    "pickpocketing",
    "other_theft",
    "attempted",
  ] as const;

  return (
    <section>
      <h1>{t("title")}</h1>

      <div className="notice warn">{t("emergencyNotice")}</div>
      <p>{t("intro")}</p>
      <div className="notice">{t("prototypeNotice")}</div>

      <form>
        <fieldset>
          <legend>{t("steps.category")}</legend>
          {categories.map((c) => (
            <label key={c}>
              <input type="radio" name="category" value={c} /> {t(`category.${c}`)}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{t("steps.relationship")}</legend>
          <label>
            <input type="radio" name="relationship" value="victim" />{" "}
            {t("relationship.victim")}
          </label>
          <label>
            <input type="radio" name="relationship" value="witness" />{" "}
            {t("relationship.witness")}
          </label>
        </fieldset>

        <fieldset>
          <legend>{t("steps.location")}</legend>
          <div className="map-placeholder" role="img">
            Map pin selector (Stage 2/3)
          </div>
        </fieldset>

        <fieldset>
          <legend>{t("steps.datetime")}</legend>
          <label>
            <input type="date" name="occurrenceDate" />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t("steps.experience")}</legend>
          <label>
            <textarea
              name="experience"
              rows={6}
              minLength={30}
              maxLength={2000}
              placeholder={t("experienceHint")}
            />
          </label>
        </fieldset>

        <fieldset>
          <legend>{t("steps.consent")}</legend>
          <label>
            <input type="checkbox" name="consent" /> {t("consentLabel")}
          </label>
        </fieldset>

        <button className="btn" type="button" disabled>
          {t("submit")}
        </button>
      </form>
    </section>
  );
}
