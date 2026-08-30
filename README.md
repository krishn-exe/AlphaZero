# Landslide Monitoring Backend — SIH26001

Backend for the NER AI-based landslide early-warning system. Built in
slices — the heatmap is complete and deployed; incident reporting is
the next slice, planned below.

Stack: Node.js + Express + Prisma + PostgreSQL

Live URL: `https://land-slide-sih26.onrender.com`
Local dev: `http://localhost:5000`

---

## ✅ Slice 1 — Heatmap (DONE)

### What it does
Serves district- and city-level landslide risk data as GeoJSON so the
frontend can render a choropleth map. All district data is currently
demo/placeholder; only two pilot cities (Aizawl, Shillong) are wired
to receive real AIML model output.

### Data model
- **District** — 78 rows, real NER administrative boundaries (sourced
  from geohacker/india, filtered to the 8 NER states). Every district
  has a randomized demo `riskScore` — none of these are real model
  output.
- **City** — only 2 rows exist: Aizawl City and Shillong City, each
  linked to its parent District. These are where AIML's real DL model
  scores land, via the PUT endpoint below. Every other district has
  no city rows at all — that's expected, not a bug.

Both models share the same shape: `riskScore` (float, 0–100),
`riskLevel` (auto-computed: low/medium/high/severe), `confidence`
(optional, 0–1), `computedAt` (optional, when the score was actually
generated — separate from `lastUpdated`, which is just the DB write
time).

### Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/map/national` | none | All districts as GeoJSON `FeatureCollection` |
| GET | `/api/map/district/:id` | none | Single district detail |
| GET | `/api/map/district/:id/cities` | none | City drill-down (empty array for most districts) |
| PUT | `/api/map/district/:id/risk` | `x-api-key` | AIML pushes a district score |
| PUT | `/api/map/city/:id/risk` | `x-api-key` | AIML pushes a real city score (Aizawl/Shillong) |

PUT body: `{ "riskScore": 72.5, "confidence": 0.85, "computedAt": "2026-08-26T14:30:00Z" }`
— only `riskScore` is required.

### Setup (local)
```
npm install
cp .env.example .env        # fill in DATABASE_URL and AIML_API_KEY
npx prisma migrate dev --name init
node prisma/seed.js
npm run dev
```
The seed script is idempotent — safe to re-run, it skips seeding if
districts already exist (this matters because the same command also
runs automatically on every Render deploy).

### Testing
A Postman collection (`SIH26001-Landslide-API.postman_collection.json`)
covers all 5 read endpoints and 4 write endpoints with real assertions
(status codes, auth rejection, validation, correct risk bucketing).
Run the whole collection with Runner → Start run before trusting any
change to this slice.

### Known limitations
- 78 districts, not the full ~130 NER districts (source dataset
  predates some recent district splits) — good enough for a demo,
  worth upgrading with fresher boundary data later if time allows.
- Free-tier Render deployment spins down after 15 min idle — first
  request after a quiet period takes 30–50s. Warm it up before a demo.

---

## ✅ Slice 2 — Report an Incident (DONE)

### What it does
Lets a user submit a report (text description + location) about something they observed — a landslide, blocked road, or other hazard — so authorities can see community-reported incidents alongside the AI-predicted risk heatmap.

### Data model
- **Incident** — point locations containing a description, category, latitude, longitude, and status (`pending` by default). These are not tied to a specific district or city, but act as a separate map layer.

### Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| POST | `/api/incidents` | none | Submit a new report (rate-limited) |
| GET | `/api/incidents` | none | List all incidents as a GeoJSON `FeatureCollection` |
| GET | `/api/incidents/:id` | none | Single incident detail |
| PATCH | `/api/incidents/:id/status` | `x-api-key` | Admin action: mark an incident verified/resolved |

POST body: `{ "description": "Blocked road", "category": "road_blockage", "latitude": 23.727, "longitude": 92.717 }`

### Open questions resolved
1. **Photo storage** — Skipped for now to focus on core functionality.
2. **Who can verify/resolve an incident?** — Protected using the same `x-api-key` shared secret used for the AIML pipeline.
3. **Data relationship** — Incidents are completely independent point geometries (no `districtId` FK) to easily layer on top of the map.
4. **Rate limiting** — `express-rate-limit` implemented on the public POST route to prevent spam.

### Explicitly out of scope for this slice
SMS/push alerts, incident-to-district linking, moderation dashboard —
these can come later if there's time, same as they were deferred from
the heatmap slice originally.
