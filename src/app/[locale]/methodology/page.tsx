import { getTranslations } from "next-intl/server";

// Methodology & legend page. Content is intentionally plain for the Stage 1
// shell; the full, versioned methodology text is authored during the pilot.
export default async function MethodologyPage() {
  const legend = await getTranslations("legend");
  const home = await getTranslations("home");

  return (
    <section>
      <h1>{legend("title")}</h1>
      <p>{home("disclaimer")}</p>
      <ul>
        <li>{legend("grey")}</li>
        <li>{legend("yellow")}</li>
        <li>{legend("amber")}</li>
        <li>{legend("red")}</li>
      </ul>
      <p style={{ color: "var(--muted)" }}>{legend("note")}</p>
    </section>
  );
}
