import type { Metadata } from "next";
import { Inter, Anek_Bangla } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const bengali = Anek_Bangla({
  subsets: ["bengali"],
  variable: "--font-bengali",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return {
    title: t("appName"),
    description:
      "Moderated community reports of robbery, snatching and theft in Dhaka.",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  const messages = await getMessages();
  const t = await getTranslations("nav");
  const common = await getTranslations("common");
  const otherLocale = locale === "bn" ? "en" : "bn";

  return (
    <html lang={locale} className={`${inter.variable} ${bengali.variable}`}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <header className="site-header">
            <div className="bar">
              <Link href="/" className="brand">
                {common("appName")}
              </Link>
              <nav>
                <Link href="/">{t("home")}</Link>
                <Link href="/methodology">{t("methodology")}</Link>
                <Link href="/privacy">{t("privacy")}</Link>
                <Link href="/" locale={otherLocale}>
                  {common("switchTo")}
                </Link>
                <Link href="/report" className="btn">
                  {t("report")}
                </Link>
              </nav>
            </div>
          </header>
          <main className="container">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
