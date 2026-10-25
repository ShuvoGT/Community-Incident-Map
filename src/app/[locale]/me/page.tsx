import { getTranslations } from "next-intl/server";
import { MySubmissions } from "@/components/MySubmissions";

export default async function MePage() {
  const t = await getTranslations("me");
  return (
    <section>
      <h1>{t("title")}</h1>
      <MySubmissions />
    </section>
  );
}
