# AIML Pipeline Integration Guide

This guide details how the Machine Learning pipeline should connect to the Node.js backend to push landslide risk predictions.

## Base URL
- **Local Development**: `http://localhost:5000`
- **Production**: (Update with your deployed Render/Vercel backend URL)

---

## 1. National Grid Predictions (Runs every 4 hours)

The pipeline computes risk across a grid of ~4,600 coordinates and pushes them to the backend in bulk.

- **Endpoint:** `POST /api/map/national`
- **Content-Type:** `multipart/form-data`
- **Authentication:** Send the API key in the `key` field (or leave empty if not configured).

### Form Fields Required:
1. `key`: string (API key for authentication)
2. `time`: string (e.g., `2026-09-07 16:00:00 IST`)
3. `data`: The `predictions.csv` file.

### CSV Format Requirements (`predictions.csv`):
Must be UTF-8 encoded with the following exact headers:
```csv
Latitude,Longitude,Risk_Rating
25.2,91.55,0.1661
25.2,91.559951,0.1964
```

### Expected Response:
On success, the backend replaces the old grid points and returns `200 OK`:
```json
{
  "status": "ok",
  "received": 4600,
  "timestamp": "2026-09-07 16:00:00 IST"
}
```
*Note: If you receive a `4xx` or `5xx` error, please implement a retry mechanism (up to 3 times with backoff).*

---

## 2. City-Level Deep Learning Model (Aizawl & Shillong)

For specific pilot cities, the pipeline pushes direct risk updates.

- **Endpoint:** `PUT /api/map/city/:id/risk`
- **Content-Type:** `application/json`
- **Authentication:** Send the API key in the `Authorization: Bearer <key>` header.

### JSON Payload:
```json
{
  "riskScore": 82.5,
  "computedAt": "2026-09-07T16:00:00Z"
}
```
*Note: `riskScore` must be a number between 0 and 100. The backend will automatically map this to a `riskLevel` (low/medium/high/severe) and trigger email alerts to subscribers if it escalates.*
