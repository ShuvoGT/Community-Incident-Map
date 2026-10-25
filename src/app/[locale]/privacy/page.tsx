import { getTranslations } from "next-intl/server";

// Privacy & reporting-rules page shell. The owner must review and complete
// this content, with local legal advice, before launch.
export default async function PrivacyPage() {
  const common = await getTranslations("common");
  return (
    <section>
      <h1>{common("appName")}</h1>
      <p>
        Reporters are anonymous to the public. Contact details, the original
        narrative, evidence and any police reference are kept in private
        storage, separate from the public map, and are never published.
      </p>
      <p style={{ color: "var(--muted)" }}>
        Full privacy, consent and takedown policy is finalised before launch.
      </p>
    </section>
  );
}
