import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Privacy: never leak reporter identifiers through powered-by/server headers.
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
