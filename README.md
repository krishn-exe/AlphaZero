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

## 🚧 Slice 2 — Report an Incident (PLANNED, not built)

### What it needs to do
Let a user submit a report (text description + optional photo +
location) about something they observed — a landslide, blocked road,
or other hazard — so authorities can see community-reported incidents
alongside the AI-predicted risk heatmap.

### Data model (proposed)
```prisma
model Incident {
  id           Int      @id @default(autoincrement())
  description  String
  category     String   // e.g. "landslide", "road_blockage", "other"
  latitude     Float
  longitude    Float
  photoUrl     String?  // uploaded image, stored externally (see below)
  status       String   @default("pending") // pending | verified | resolved
  reportedAt   DateTime @default(now())
}
```
No `districtId`/`cityId` foreign key planned initially — incidents are
point locations, not tied to administrative boundaries, though that
could change if the frontend wants to show incidents nested under a
district view.

### Endpoints needed
- `POST /api/incidents` — submit a new report (description, category,
  lat/lng, optional photo). Public, no auth — anyone can report.
- `GET /api/incidents` — list all incidents, likely as GeoJSON so it
  can layer on top of the existing heatmap the same way districts do.
- `GET /api/incidents/:id` — single incident detail.
- `PATCH /api/incidents/:id/status` — mark an incident
  verified/resolved. This one probably needs auth (an admin/authority
  action), unlike the heatmap's AIML-only auth — worth deciding who
  can call this before building it.

### Open questions to resolve before building
1. **Photo storage** — the original `.env.example` had AWS S3 config
   scaffolded but unused. Decide: real S3/Cloudinary upload, or skip
   photos for the hackathon and just take a description + location?
   Photo upload adds real complexity (multipart form handling,
   storage costs, file size limits) for a feature that may not be
   core to the demo.
2. **Who can verify/resolve an incident?** No auth/user system exists
   yet anywhere in this backend. A minimal shared-secret approach
   (like the AIML key) could work for a hackathon-scoped "admin
   action," but won't be dressed up as full authentication.
3. **Does an incident need to show up "inside" a district's data**,
   or is it a fully separate map layer the frontend adds on top? This
   affects whether `Incident` needs a `districtId` relation at all.
4. **Rate limiting / spam** — a fully public POST endpoint with no
   auth is open to abuse. Even a simple safeguard (e.g. one
   submission per IP per few minutes) is worth considering before a
   public demo link goes out.

### Suggested build order (once the above are decided)
1. `Incident` schema + migration
2. `POST /api/incidents` (text + location only, no photo yet) — get
   the simplest version working end-to-end first
3. `GET /api/incidents` as GeoJSON, matching the heatmap's response
   shape so frontend can reuse existing map-rendering code
4. Photo upload, only if time allows and storage is decided
5. `PATCH /api/incidents/:id/status` with whatever auth approach was
   chosen

### Explicitly out of scope for this slice
SMS/push alerts, incident-to-district linking, moderation dashboard —
these can come later if there's time, same as they were deferred from
the heatmap slice originally.
