# Dhaka Community Incident Map

A community incident reporting and awareness platform. People report first-hand
experiences of robbery, snatching and theft, an approximate location is shown on
a moderated map, and weekly reporting patterns are surfaced by area and time.

> A highlighted area shows a **concentration of published community reports**,
> not a measure of personal risk. An area with no reports is never labelled safe.
> The platform does not dispatch police or establish that a crime occurred.

See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) for the full design and
the staged delivery plan.

## Stack

- **Next.js** (App Router, TypeScript) — single web app + background worker
- **PostgreSQL + PostGIS**, **H3** resolution-9 grid for the public hotspot layer
- **Drizzle ORM**, **next-intl** (Bangla + English), **MapLibre GL**
- Private **S3-compatible** object storage for evidence (never public)

## Local development

Prerequisites: Node.js ≥ 20, Docker.

```bash
# 1. Start local infrastructure (PostGIS :55432, Redis :6380, S3 :9100)
docker compose up -d

# 2. Configure environment
cp .env.example .env   # fill in map/geocode/verification keys as needed

# 3. Install dependencies
npm install

# 4. Create the database schema
npm run db:generate    # generate SQL migration from the Drizzle schema
npm run db:migrate     # apply it

# 5. Run the app
npm run dev            # http://localhost:3000  (redirects to /bn)
```

## Project layout

```
src/
  app/[locale]/        public pages, report flow, moderator & admin areas
  server/db/           Drizzle schema + client
  server/worker/       background jobs (aggregate refresh, scanning, retention)
  i18n/                next-intl routing + request config
messages/              bn.json, en.json
docker/db-init/        PostGIS / pgcrypto bootstrap
```

## Status

Stage 1 (design & setup) in progress — scaffolding, schema, i18n and static
prototypes of the report flow and public map shell. Backend wiring begins in
Stage 2.
