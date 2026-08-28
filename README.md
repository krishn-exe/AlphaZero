# Landslide Monitoring Backend — Heatmap Slice

Minimal backend to power the heatmap feature. Everything else (auth,
incident uploads, alerts, cron jobs) is intentionally left out until
the heatmap is working end-to-end.

## Setup

1. Install Postgres and enable PostGIS (only needed later — this slice
   stores geometry as GeoJSON text, so plain Postgres works for now):
   ```
   createdb landslide_db
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your `DATABASE_URL`:
   ```
   cp .env.example .env
   ```

4. Push the schema to your DB and seed dummy data:
   ```
   npx prisma migrate dev --name init
   npx prisma db seed
   ```

5. Run the server:
   ```
   npm run dev
   ```

## Endpoints (heatmap slice)

- `GET /api/map/national` — returns all districts as a GeoJSON
  FeatureCollection. Feed this straight into Leaflet's `L.geoJSON()`
  or Mapbox GL's `addSource` with a `fill` layer colored by
  `properties.riskLevel`.
- `GET /api/map/district/:id` — single district detail, for when a
  user clicks into one district.
- `PUT /api/map/district/:id/risk` — updates a district's risk score.
  Body: `{ "riskScore": 62 }`. This is the endpoint your AIML
  teammate's model (or a manual test script) will eventually call.

## Frontend integration note

`riskLevel` is computed server-side (`low` / `medium` / `high` /
`severe`) so the frontend never needs to duplicate threshold logic —
just map each level to a color in one place (e.g. green/yellow/orange/red).

## What's intentionally NOT here yet

Auth, incident photo uploads, SMS/push alerts, and the rainfall cron
job are separate slices — add them once the heatmap is rendering
correctly end-to-end. See the seed script for how to swap in real
district boundaries later (replace the generated boxes with actual
GeoJSON from Bhuvan/GSI shapefiles converted via `ogr2ogr` or
`mapshaper`).
