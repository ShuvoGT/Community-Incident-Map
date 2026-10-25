-- Runs once on first database init (empty data volume).
-- PostGIS for coordinate validation / geocode staging, and a stable
-- UUID generator. H3 cell ids are stored as text (h3-js computes them
-- server-side); add the h3-pg extension later only if we move H3 work
-- into SQL.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
