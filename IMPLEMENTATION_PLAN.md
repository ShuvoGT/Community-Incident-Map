# Dhaka Community Incident Map — Implementation Plan

**Stack:** Next.js (App Router, TypeScript) · PostgreSQL + PostGIS · background worker
**Source:** `Dhaka Incident Map.docx` (Product brief v1.0, 25 Oct 2026)
**Status:** Draft for review — no code written yet.

---

## 0. Guiding principles (non-negotiable)

These shape every technical decision. Breaking one is a bug, not a preference.

1. **Not a risk map.** Hotspot = concentration of *published reports*, never a probability of victimisation. No "safe"/green anywhere. An empty cell is "no reports", never "safe".
2. **Two separate data worlds.** A **private store** (contact, original narrative, evidence, police refs, raw coordinates) and a **public read model** (redacted, aggregated, cell-based). The public side can *never* reach into the private side — enforced in schema, API and queries, not just UI.
3. **Raw location dies at the door.** Street-level coordinates are converted to an H3 cell server-side and the original lat/lng is discarded. Public markers use the cell centre only.
4. **Nothing is public until a moderator publishes it.** Submission → review → (maybe) publish. No auto-publish, no auto-post to social.
5. **Everything is auditable.** Every state transition records actor, timestamp, reason and prior version.
6. **Bangla and English are equal citizens.** Same structured data, both locales, no auto-translation of sensitive claims.

---

## 1. Tech stack & key libraries

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Public pages = Server Components + ISR; report form & dashboards = Client Components. |
| DB | **PostgreSQL 16 + PostGIS 3.4** | PostGIS for coordinate validation/geocode staging; H3 for the public grid. |
| ORM / migrations | **Drizzle ORM** (+ drizzle-kit) | SQL-first, typed, easy to express partial indexes & raw PostGIS/H3 SQL. (Prisma is the fallback if preferred.) |
| H3 | **h3-js** (and/or `h3-pg` extension) | Resolution 9 cells. Centre + boundary from h3-js. |
| Map (client) | **MapLibre GL JS** | Open, no vendor lock to Mapbox GL license. |
| Tiles + geocoding | **Licensed provider** (MapTiler or Mapbox), server-proxied | OSM raw tiles are *not* a free production service. Geocode **server-side** with quota + cache; never send narrative/contact to provider. |
| Object storage | **S3-compatible** (AWS S3 / Cloudflare R2 / MinIO in dev) | Private bucket, short-lived signed URLs, no public URLs. |
| Background worker | **BullMQ + Redis** (or pg-boss if we want to avoid Redis) | Aggregate refresh, evidence scan, metadata strip, retention jobs, preview-image generation. |
| OTP / contact verify | Pluggable: **email (SMTP/Resend)** default; **SMS** adapter behind an interface | Brief leaves email-vs-SMS as an owner decision — build an interface so either works. |
| Image handling | **sharp** | Strip EXIF/metadata, validate signatures, generate share cards. |
| File scanning | **ClamAV** (clamd) via worker | Reject executables/unsupported content. |
| i18n | **next-intl** | `bn` + `en`, locale-prefixed routes. |
| Auth | Reporter = OTP-only magic/token session. Staff (moderator/admin) = credential + **MFA (TOTP)**. | Two distinct auth paths. |
| Validation | **Zod** | Shared schemas between client form, API and worker. |
| Testing | **Vitest** (unit), **Playwright** (e2e/acceptance) | Acceptance tests from brief §9 map to Playwright specs. |

> All dependency versions pinned at implementation time.

---

## 2. High-level architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js app                          │
│                                                          │
│  Public (SSR/ISR, cached)   │   Authenticated            │
│  - /          map + list    │   - /report  (form)        │
│  - /incident/[publicId]     │   - /me/...  (reporter)    │
│  - /area/[cell]             │   - /moderate (staff)      │
│  - /methodology /privacy    │   - /admin    (staff+MFA)  │
│                                                          │
│  API routes (/api/*) ── read public model / write private│
└───────────────┬─────────────────────────┬────────────────┘
                │                          │
       ┌────────▼────────┐        ┌────────▼────────┐
       │ PostgreSQL      │        │ Object storage  │
       │  + PostGIS      │        │ (private, signed│
       │ private tables  │        │  URLs only)     │
       │ public read model│       └─────────────────┘
       └────────┬────────┘
                │ jobs
       ┌────────▼────────┐
       │ Worker (BullMQ) │  aggregate refresh (15 min + on moderation),
       │                 │  evidence scan/strip, retention purge,
       │                 │  share-card render, cache invalidation
       └─────────────────┘
```

Single deployable web app + one worker process. No microservices.

---

## 3. Data model (maps to brief §8)

Private vs public separation is physical (different tables, the public read model holds *only* safe fields).

### `accounts` (private)
`id uuid pk`, `contact_encrypted`, `contact_hash` (for lookup/rate-limit), `contact_type` (email|phone), `verified_at`, `role` (reporter|moderator|admin), `consent_versions jsonb`, `created_at`, `last_active_at`. No public profile ever.

### `submissions` (private)
`id uuid pk`, `owner_id fk`, `canonical_incident_id fk null`, `original_text`, `structured answers` (category, relationship, items_taken[], item_value_bdt, offender_count, weapon_*, injury, context_*, police_report_*), `occurrence_local_date`, `occurrence_time`, `time_precision` (exact|approx|band|unknown), `raw_coord` *(transient — nulled after cell derivation)*, `cell_id null`, `broad_area`, `location_precision` (street|area), `status`, `version`, `idempotency_key`, timestamps.
- **Unique idempotency key per account** → retry never creates a 2nd submission.

### `incidents` (canonical event; feeds public model)
`id uuid pk`, `public_id` (short, stable, shareable), canonical `category`/`occurrence_date`/`time_band`/`cell_id`, `redacted_narrative`, safe flags (`weapon_flag`, `injury_flag`, `offender_band`, `items_taken_public[]`), `review_label`, `publication_state`, `published_at`, `updated_at`, `corrected_at`. One event ↔ many submissions.

### `evidence` (private)
`submission_id fk`, `object_key`, `file_type`, `size`, `checksum`, `scan_status`, `metadata_stripped bool`, `expiry_at`. No permanent/public URL.

### `reviews_and_flags` (private, audit)
`id`, `target_type`+`target_id`, `actor_id`, `action`, `reason`, `before_version`, `after_version`, `evidence_review_basis`, `appeal_outcome`, `created_at`.

### `aggregates` (derived, public)
`cell_id`, `window_start`, `window_end`, `count`, `status_breakdown jsonb`, `category_breakdown jsonb`, `time_breakdown jsonb`, `excluded_count`, `computed_at`, `rule_version`. Derived only from eligible canonical published incidents.

### `configuration` (audited admin)
`launch_polygon` (PostGIS geometry), `thresholds`, `grid_resolution` (=9), `rate_limits`, `retention_policy`, `translations`, `rule_version`.

**Constraints & indexing**
- System timestamps **UTC**; occurrence dates/display **Asia/Dhaka**. Unknown time = `null` (never fabricate midnight).
- Validate coordinate inside launch polygon *before* conversion; allowed-category check; ownership & state-transition enforcement.
- Spatial index (cell_id), date + publication indexes, unique idempotency key.
- **Optimistic version check** on edits → one moderator can't silently overwrite another.

---

## 4. Hotspot calculation (brief §4)

- **Grid:** H3 **resolution 9**. Store `cell_id`; show cell boundary + "Approximate area, not exact incident point."
- **Window:** rolling **7 Dhaka calendar days ending today** (today partial), by **occurrence date** (not submission date). Only canonical **published** incidents with a known cell.
- **Bands (initial product thresholds, not risk levels):**

| Unique incidents | Colour | Public label |
|---|---|---|
| 0 | Grey | No published reports in this period |
| 1–4 | Yellow | Some reported incidents |
| 5–9 | Amber | Elevated reported activity |
| 10+ | Red | High reported activity |

- Ranges are non-overlapping (5, 9, 10 unambiguous). **Never green / "safe".**
- Broad-area submissions that can't be confidently assigned to one cell → included in list + area totals, **excluded from grid**, and the **excluded count is disclosed**.
- Every hotspot response returns: exact date range, `Asia/Dhaka`, calculation timestamp, `rule_version`.
- **Severity ≠ confidence:** a weapon/injury incident gets a *separate badge* even in a Yellow cell. Review-status counts shown, no risk score.
- 30-day / category / time filters use a **neutral "Filtered reports" scale** — do **not** reuse weekly colours.
- Refresh aggregates **every 15 min** + invalidate affected public data on moderation change. Zoom changes clustering only, never underlying cell counts.

---

## 5. Moderation workflow (brief §5)

States: `draft → submitted → under_review → {published | needs_clarification | rejected | merged}`.
Published can become `temporarily_hidden → corrected/republished | withdrawn`.

- Edits stay private until reviewed. **Urgent privacy removal hides the public version immediately.**
- Redacted public narrative created **separately** from the original.
- Reject threats, targeted accusations, spam. **Never** publish suspect names, faces, vehicle reg numbers, home addresses.
- **Duplicate handling:** candidate = same/neighbouring cell + same date + overlapping known time + similar category/narrative. Moderator decides "one event?". Merge preserves child submissions privately under a canonical incident; **audited unmerge** supported. One event witnessed by 5 → counts once.
- **Review labels:** "Community report reviewed", "Supporting material reviewed", "Independently corroborated" (needs documented independent source — never from likes/reposts/GD alone), "Disputed and under review".
- **Abuse controls (launch defaults):** 3 submissions/verified contact/day, network rate limits, progressive challenge, verification throttling, upload quotas. Shared networks must not block legit residents. Flag counts alone never auto-remove.
- Appeals: private rejection reasons; one clarification/appeal without re-submitting; owner assigns backup reviewer. Priority: identifying info/threats → weapon/injury → ordinary. Target 24h review while staffed; publish actual availability.

---

## 6. API contracts (brief §9)

| Endpoint | Contract |
|---|---|
| `GET /api/incidents` | Public approved fields only; bbox, dates, category, cursor pagination; max 100/page. |
| `GET /api/incidents/{publicId}` | Approved public version or neutral unavailable; no private/owner data. |
| `GET /api/hotspots` | Cell geometry, count, band, exclusions, date range, rule_version, generated_at; viewport-bound. |
| `POST /api/submissions` | Verified contact + Zod validation + idempotency key → private submission id + pending state. Never auto-publish. |
| `GET/PATCH /api/me/submissions/{id}` | Authenticated owner only. Corrections → reviewable revisions; withdrawal hides public version. |
| `POST /api/incidents/{id}/flags` | Rate-limited; no public discussion; flagger identity never disclosed. |
| `POST /api/admin/reviews/{id}/action` | Role-checked transition + reason + version guard → updates public read model, queues aggregate/cache refresh. |
| `GET /api/admin/exports` | Role-checked aggregate CSV; declared filter scope + methodology; **CSV formula-injection protection**. |

---

## 7. Privacy & security (brief §7)

- Private storage separate from public read model; moderators get minimum access; admins use MFA.
- Encrypt in transit + at rest; evidence in private object storage with short-lived signed links; **log all access to private evidence & exports**.
- Strip image metadata, scan uploads, validate signatures, reject executables. Evidence **never publicly downloadable** in MVP.
- Reporter identifiers never in HTML, API responses, analytics, server logs or preview metadata. Session replay off on report/account pages.
- **Retention defaults (configurable):** rejected/abandoned → 30 days; private evidence + unredacted narrative → 90 days after final review; public redacted incidents → 12 months then non-identifying aggregates; inactive reporter accounts → 12 months (with notice); audit logs → 180 days (identifying payloads removed). Withdrawal = immediate public + aggregate removal, private deletion queued ≤30 days; backups expire ≤30 days and restores reapply deletions.
- Owner must obtain local privacy/publication legal advice before launch — plan does not assert compliance.

---

## 8. Public detail & sharing (brief §6)

- Detail page shows: public id, broad area, date, public time band, category, redacted experience, optional items taken, offender band, weapon/injury flags, review label, publish/correction dates, + "Report a concern" & "Share". **Never** contact, evidence, financial loss, raw coordinate.
- Share only after publication: device share sheet + copy-link + downloadable card fallback. Never auto-post.
- Server-generated social preview metadata (broad area, date, category, review status, approx-location notice, canonical URL). Text card preferred (avoids tile licensing). Stable URLs + revisioned preview images; corrected pages show update notice; withdrawn pages show neutral unavailable message + purge preview assets + invalidate caches. Warn reporters external platforms may cache.
- **Time bands:** 00:00–05:59 / 06:00–11:59 / 12:00–17:59 / 18:00–23:59 Asia/Dhaka + Unknown. Date-only → Unknown. Suppress time-band breakdown for cells with <5 incidents.
- Accessibility/low-bandwidth: text labels + colours, keyboard nav, contrast, large targets; manual place search when GPS denied; list browsing when tiles fail.

---

## 9. Proposed project structure

```
community-incidents/
├─ src/
│  ├─ app/
│  │  ├─ [locale]/(public)/        # map, list, incident, area, methodology, privacy
│  │  ├─ [locale]/report/          # guided report flow
│  │  ├─ [locale]/me/              # reporter status/corrections
│  │  ├─ [locale]/moderate/        # moderator queue
│  │  ├─ [locale]/admin/           # settings, exports (MFA)
│  │  └─ api/                      # route handlers (§6)
│  ├─ server/
│  │  ├─ db/ (schema, migrations, queries)
│  │  ├─ services/ (hotspot, moderation, geocode, verification, evidence, export)
│  │  ├─ auth/ (reporter-otp, staff-mfa)
│  │  └─ worker/ (jobs)
│  ├─ lib/ (h3, zod schemas, time/tz, csv-safe)
│  ├─ components/ (map, forms, cards)
│  └─ i18n/ (bn, en messages)
├─ tests/ (vitest, playwright acceptance)
├─ docker-compose.yml (postgis, redis, minio, clamav for dev)
└─ drizzle.config.ts
```

---

## 10. Delivery stages (brief §10)

### Stage 1 — Design & setup
Agree Dhaka boundary polygon, final name/brand, category definitions, bn/en translations. Scaffold Next.js + Drizzle + PostGIS, docker-compose dev env, migrations, i18n, base layout. Prototype report flow + public detail + review queue (static).
**Exit:** env reproducible, migrations run, prototypes clickable.

### Stage 2 — End-to-end reporting
Contact verification (OTP interface + email default), validated guided form (Zod, draft-before-verify, idempotency), private evidence upload + scan/strip worker, moderator review UI, public read model write on publish.
**Exit:** one report demonstrated through approval → correction → withdrawal.

### Stage 3 — Map & sharing
H3 cell aggregation + 15-min refresh job, weekly band rules, 7/30-day + category + time filters, accessible list, area summaries, social cards + server preview metadata, cache invalidation.
**Exit:** passes count-band, duplicate/merge, time-boundary and privacy tests.

### Stage 4 — Pilot & hardening
Admin settings/config, aggregate CSV export (formula-injection safe), retention jobs, audit logging, abuse/rate limits, MFA for staff. Load test (50k synthetic incidents, 100 concurrent readers), backup/restore + deletion reapplication, perf tuning.
**Exit:** all acceptance checks pass, launch gates met.

*Brief's scope estimate: 5–7 weeks for one experienced full-stack dev + part-time QA. Not a commitment.*

---

## 11. Acceptance tests → Playwright specs (brief §9)

1. Counts 0/1/4/5/9/10 → exact bands; removing one from 10 changes band after refresh.
2. 5 submissions → one event counts once after merge; unmerge restores + audit; zoom doesn't change totals.
3. Report today about older event lands in its occurrence period; test Dhaka midnight, date-only, future date (rejected), 7-day boundary.
4. Pending/rejected/merged-child/hidden/withdrawn never enter public counts; broad-location excluded from grid + disclosed.
5. Visitor / other reporter / social crawler cannot retrieve contact, evidence, original narrative or private coords via any endpoint/asset.
6. Approval → shareable page; edit waits for review; withdrawal removes live content + invalidates previews.
7. GPS denial, map outage, failed OTP, duplicate-submit retry → usable fallbacks; bn text, mobile, keyboard, text legends work.
8. Malicious uploads, stored XSS, unauthorised admin access, CSV formula payloads blocked; backup restore reapplies deletions.

---

## 12. Engineering & launch targets (brief §10)

- Usable mobile UI ≤3s on midrange Android + mobile connection; cached map API p95 <1s; count refresh ≤15 min; daily backups, 24h RPO / 8h RTO.
- Validate with 50k synthetic incidents + 100 concurrent readers in staging.
- Spend alerts for maps, geocoding, OTP, storage. Synthetic data only in staging, clearly labelled, never public.
- Metrics: completed vs abandoned submissions, review time, duplicate/rejection rate, location/time completeness, privacy complaints, corrected/withdrawn, repeat map use, authority acknowledgements/actions. Don't reward report volume; don't claim crime reduction.

---

## 13. Open decisions needed from owner/Shubho (before/early)

| # | Decision | Default if unspecified |
|---|---|---|
| 1 | Final brand name + domain | "Dhaka Community Incident Map" placeholder |
| 2 | Exact Dhaka launch boundary polygon | Dhaka metro approx polygon, refine later |
| 3 | **Email vs SMS** verification | Email (build adapter for both) |
| 4 | Map/geocode provider (MapTiler vs Mapbox) + budget | MapTiler (proxied) |
| 5 | Hosting target (VPS / Vercel+managed PG / self-host) | affects deploy config |
| 6 | Moderator + backup staffing commitment | required before public launch (gate) |
| 7 | ORM preference (Drizzle vs Prisma) | Drizzle |

---

## 14. Immediate next step after plan approval

Stage 1 kickoff: scaffold the Next.js + TypeScript app, add Drizzle + PostGIS docker-compose, write the initial schema migration for the 7 entities, wire next-intl (bn/en), and stand up the base layout + a static report-flow prototype.
