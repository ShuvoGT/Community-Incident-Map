import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // PostGIS / pgcrypto are provisioned by docker/db-init; don't let
  // drizzle try to manage extension objects.
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
