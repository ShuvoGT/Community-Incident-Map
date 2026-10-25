# Deploying the Dhaka Community Incident Map

## What works where

- **Public pages** (dashboard, map, incident/area pages, share cards) work with
  no sign-in — this is what you'll "see live" immediately.
- **Submitting a report** and **staff moderation/admin** need a one-time code
  (OTP) sent to the user's email. In development the code is printed to the
  server console; **in production you must configure an email provider** (see
  `VERIFICATION_CHANNEL` / `SMTP_URL`) or those sign-in flows won't complete.
- **Evidence upload** needs S3-compatible storage; the **background worker**
  (evidence scan + 15-min aggregate refresh) is optional — hotspot counts
  already recompute on each publish.

---

## Fastest path — Vercel + Neon (no Docker)

1. **Database (Neon, free, has PostGIS)** — create a project at neon.tech,
   then in its SQL editor run: `CREATE EXTENSION IF NOT EXISTS postgis;`
   Copy the connection string (the `DATABASE_URL`).

2. **Run migrations + seed demo data** from your machine, pointed at Neon:
   ```bash
   DATABASE_URL="postgres://…neon…" npm run db:migrate
   DATABASE_URL="postgres://…neon…" npm run seed:demo        # optional demo data
   DATABASE_URL="postgres://…neon…" npm run seed:staff -- you@example.com admin
   ```

3. **Deploy the app (Vercel)** — at vercel.com, "Add New → Project", import
   `ShuvoGT/Community-Incident-Map`. Framework auto-detects as Next.js.
   Add these Environment Variables, then Deploy:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | your Neon connection string |
   | `CONTACT_ENCRYPTION_KEY` | a 32-byte base64 key — `openssl rand -base64 32` |
   | `APP_BASE_URL` | your Vercel URL, e.g. `https://community-incident-map.vercel.app` |
   | `APP_TIMEZONE` | `Asia/Dhaka` |
   | `NEXT_PUBLIC_MAPTILER_KEY` | *(optional)* a MapTiler key; omit to use the free OSM basemap |

4. Open the URL → the **dashboard and map are live**. The map uses free
   OpenStreetMap tiles by default, so no map key is needed.

> On Vercel the background worker does not run. Core features work; evidence
> scanning and the 15-min refresh need the worker (use the Docker path below).
> For OTP sign-in on Vercel, add `VERIFICATION_CHANNEL=email` + `SMTP_URL`.

---

## Full stack — Docker host (Render / Railway / Fly / VPS)

A `Dockerfile` (web app, standalone) is included.

1. Provision **PostgreSQL with PostGIS** (Render Postgres, Railway Postgres,
   Supabase…) and run `CREATE EXTENSION postgis;` once, then
   `npm run db:migrate` against it.
2. Deploy the repo as a **Docker web service**; the platform builds the
   `Dockerfile` and runs `node server.js` on port 3000.
3. Set the same env vars as above, plus (for the optional worker/evidence):
   `REDIS_URL`, `S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`.
4. *(Optional)* Add a second **worker service** from the same repo with start
   command `npm run worker` (needs `REDIS_URL`) for evidence processing and the
   periodic aggregate refresh.

---

## Before a real launch

Configure an **email (or SMS) OTP provider**, S3 storage with lifecycle rules,
a real malware scanner (ClamAV), spend alerts, and obtain local privacy /
publication advice. See `IMPLEMENTATION_PLAN.md` §7 and §10.
