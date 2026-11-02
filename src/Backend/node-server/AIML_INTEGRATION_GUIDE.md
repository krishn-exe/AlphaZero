# AIML Pipeline Integration Guide

This guide details how the Machine Learning pipeline connects to the Node.js backend to push landslide risk predictions.

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

### Storage:
Uploaded CSV files are validated and stored in date-partitioned storage:
- Stored path: `storage/predictions/YYYY-MM-DD/predictions_YYYY-MM-DD_HH-mm-ss.csv`
- A reference copy is updated at: `storage/predictions/latest_predictions.csv`

### Expected Response (200 OK):
```json
{
  "status": "ok",
  "message": "Predictions CSV successfully validated and stored",
  "receivedRows": 4600,
  "scheduledWindow": "20:00 IST",
  "timestamp": "2026-11-02 20:05:12 IST",
  "storage": {
    "folder": "2026-11-02",
    "filename": "predictions_2026-11-02_20-05-12.csv",
    "savedPath": "storage/predictions/2026-11-02/predictions_2026-11-02_20-05-12.csv"
  }
}
```

### Error Responses:
- **401 Unauthorized**: Missing or incorrect API key.
- **403 Forbidden**: Upload submitted outside the allowed 4-hour window + 15-minute grace period.
- **400 Bad Request**: Missing file or invalid CSV schema (missing Latitude, Longitude, or Risk_Rating).
