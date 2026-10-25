import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Privacy: never leak reporter identifiers through powered-by/server headers.
  poweredByHeader: false,
  // Server-only native/optional-dep packages: load at runtime, don't bundle.
  serverExternalPackages: ["bullmq", "ioredis", "sharp"],
  // Small self-contained server bundle for Docker deploys.
  output: "standalone",
};

export default withNextIntl(nextConfig);
