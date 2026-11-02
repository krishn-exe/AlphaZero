# Landslide Monitoring Backend — SIH26001

Backend for the Northeast India AI-based landslide early-warning system (Bhu Rakshak).

Stack: Node.js + Express + Prisma + PostgreSQL

Live URL: `https://land-slide-sih26.onrender.com`
Local dev: `http://localhost:5000`

---

## 🗺️ Heatmap & AIML Predictions

### What it does
Serves district- and city-level landslide risk data as GeoJSON for frontend Leaflet rendering, and ingests 4-hourly scheduled AI/ML prediction CSVs.

### Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/map/national` | none | All districts as GeoJSON `FeatureCollection` |
| GET | `/api/map/top-risk` | none | Top-risk districts ranking |
| GET | `/api/map/stats` | none | Regional risk count breakdown |
| GET | `/api/map/district/:id` | none | Single district detail |
| POST | `/api/map/predictions` | `x-api-key` / `key` | Scheduled 4-hourly predictions CSV upload |
| POST | `/api/subscribe` | rate-limited | User email subscription for landslide alerts |
| GET | `/api/subscribe/count` | none | Total active alert subscribers count |

### Prediction Ingestion Contract
- Scheduled hours in IST: `00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST` (+15 min grace period).
- Accepted columns: `Latitude, Longitude, Risk_Rating`.
- Stored into: `storage/predictions/YYYY-MM-DD/predictions_HH-MM-SS.csv`.
