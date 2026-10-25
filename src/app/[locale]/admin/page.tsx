import { getTranslations } from "next-intl/server";
import { AdminConsole } from "@/components/AdminConsole";

export default async function AdminPage() {
  const t = await getTranslations("admin");
  return (
    <section>
      <h1>{t("title")}</h1>
      <AdminConsole />
    </section>
  );
}
