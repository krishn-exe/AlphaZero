# AIML Pipeline Integration Guide

This guide details how the Machine Learning pipeline connects to the Node.js backend to push landslide risk predictions, and how the backend aggregates batch predictions.

## Base URL
- **Local Development**: `http://localhost:5000`
- **Production**: (Deployed Render/Vercel backend URL)

---

## 1. Landslide Risk Predictions Upload

The pipeline computes risk predictions on a 4-hour schedule across India and uploads the predictions CSV to the backend.

- **Endpoint:** `POST /api/map/national` (or `POST /api/map/predictions`, `POST /api/predictions`)
- **Content-Type:** `multipart/form-data`
- **Authentication:** Key passed in form field `key`, header `x-api-key`, or `Authorization: Bearer <key>`.

### Schedule & Timing Window
- **Schedule**: Triggers at 4-hour fixed intervals in **Indian Standard Time (IST)**:
  `00:00`, `04:00`, `08:00`, `12:00`, `16:00`, `20:00 IST`.
- **Grace Period**: Requests must arrive within **15 minutes** of the scheduled hour (i.e. up to `HH:15` IST).
- *(Note: Set `BYPASS_TIME_WINDOW=true` in `.env` or pass `?bypass_time=true` during manual testing outside schedule windows).*

### Form Fields Required:
1. `key`: string (API key configured in `AIML_API_KEY`)
2. `time`: string (optional generation timestamp, e.g., `2026-11-02 20:00:00 IST`)
3. `data` (or `file`): The `predictions.csv` file.

### CSV Format Requirements (`predictions.csv`):
Must be UTF-8 encoded with 3 required columns:
```csv
Latitude,Longitude,Risk_Rating
25.2,91.55,0.1661
25.2,91.559951,0.1964
25.2,91.569901,0.0845
```
- `Latitude`: Numeric float (-90 to 90)
- `Longitude`: Numeric float (-180 to 180)
- `Risk_Rating`: Numeric float (0 to 1 or risk score)

### Storage Organization:
Uploaded CSV files are organized into nested date and batch-slot folders:
- Raw path: `storage/predictions/YYYY-MM-DD/HH-00/raw/predictions_YYYY-MM-DD_HH-mm-ss_XXXX.csv`
- Date folder path: `storage/predictions/YYYY-MM-DD/predictions_YYYY-MM-DD_HH-mm-ss_XXXX.csv`

---

## 2. Automated 30-Minute Post-Fetch Consolidation & Collision Averaging

**30 minutes after each 4-hour fetch window** (at `00:30`, `04:30`, `08:30`, `12:30`, `16:30`, `20:30 IST`), the backend automatically aggregates all uploaded CSV files for that batch into **one single final CSV file**.

### Collision Averaging Rule:
- Multiple CSV files may contain **overlapping coordinates** (identical `Latitude` and `Longitude`).
- When coordinates collide, the backend computes the arithmetic average:
  $$\text{Risk\_Rating} = \frac{\sum \text{Risk\_Rating}}{\text{Count}}$$
- The final consolidated file contains **strictly unique coordinates** with their calculated average risk ratings.

### Output Files:
1. Slot-level: `storage/predictions/YYYY-MM-DD/HH-00/final_predictions.csv`
2. Date-level: `storage/predictions/YYYY-MM-DD/final_predictions_HH-00.csv`
3. Latest unified file: `storage/predictions/latest_predictions.csv` and `storage/predictions/latest_final_predictions.csv`
4. Metadata summary: `storage/predictions/YYYY-MM-DD/HH-00/aggregation_meta.json`

---

## 3. Endpoints & Operations

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/map/predictions` | API Key | Ingests predictions CSV during the 4-hour schedule window. |
| `POST` | `/api/map/aggregate` | API Key / Public | Manually triggers aggregation for a slot (optional `date`, `slot`). |
| `GET` | `/api/map/final` | None | Downloads/streams the latest consolidated `final_predictions.csv`. |
| `GET` | `/api/map/status` | None | Returns scheduler state, upcoming aggregation time, and last execution details. |
