import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const t = await getTranslations("login");
  return (
    <section>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <LoginForm />
    </section>
  );
}
