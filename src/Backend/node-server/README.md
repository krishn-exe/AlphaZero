# Landslide Monitoring Backend — SIH26001

Backend for the Northeast India AI-based landslide early-warning system (Bhu Rakshak).

Stack: Node.js + Express + Prisma + PostgreSQL

Live URL: `https://land-slide-sih26.onrender.com`
Local dev: `http://localhost:5000`

---

## 🗺️ Heatmap & AIML Predictions

### What it does
Serves district- and city-level landslide risk data as GeoJSON for frontend Leaflet rendering, ingests 4-hourly scheduled AI/ML prediction CSVs, and automatically consolidates colliding points with average risk scores 30 minutes after each window.

### Endpoints

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/api/map/national` | none | All districts as GeoJSON `FeatureCollection` |
| GET | `/api/map/top-risk` | none | Top-risk districts ranking |
| GET | `/api/map/stats` | none | Regional risk count breakdown |
| GET | `/api/map/district/:id` | none | Single district detail |
| POST | `/api/map/predictions` | `x-api-key` / `key` | Scheduled 4-hourly predictions CSV upload |
| POST | `/api/map/aggregate` | none / key | Trigger aggregation on-demand for a given slot/date |
| GET | `/api/map/final` | none | Download the latest unified consolidated predictions CSV |
| GET | `/api/map/status` | none | Check aggregation scheduler status and upcoming timings |
| POST | `/api/subscribe` | rate-limited | User email subscription for landslide alerts |
| GET | `/api/subscribe/count` | none | Total active alert subscribers count |

### Ingestion & Consolidation Lifecycle:
1. **Upload Schedule (IST)**: `00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST` (+15 min grace period).
2. **Raw Ingestion**: Multiple CSV files are stored in nested slot folders: `storage/predictions/YYYY-MM-DD/HH-00/raw/`.
3. **Consolidation**: Exactly 30 minutes after the fetch hour (`00:30, 04:30, 08:30, 12:30, 16:30, 20:30 IST`), all raw CSVs in that slot are combined into one final CSV. Overlapping points with identical `(Latitude, Longitude)` have their `Risk_Rating` averaged.
4. **Final Output**: The unified file with strictly unique coordinates is written to `storage/predictions/YYYY-MM-DD/HH-00/final_predictions.csv` and `storage/predictions/latest_predictions.csv`.
