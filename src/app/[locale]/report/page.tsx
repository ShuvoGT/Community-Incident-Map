import { getTranslations } from "next-intl/server";
import { ReportFlow } from "@/components/ReportFlow";

export default async function ReportPage() {
  const t = await getTranslations("report");

  return (
    <section>
      <h1>{t("title")}</h1>
      <div className="notice warn">{t("emergencyNotice")}</div>
      <ReportFlow />
    </section>
  );
}
