import { getTranslations } from "next-intl/server";
import { ModerationConsole } from "@/components/ModerationConsole";

export default async function ModeratePage() {
  const t = await getTranslations("moderate");
  return (
    <section>
      <h1>{t("title")}</h1>
      <ModerationConsole />
    </section>
  );
}
