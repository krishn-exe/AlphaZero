# Landslide Risk Monitoring — Live Data Pipeline

This pipeline pulls near-real-time and static geospatial data from Google Earth Engine (GEE) and USGS Earthquake API for N rectangle regions, saving them into a single `data/output.csv` ready for ML inference.

---

## 1. Authenticate Earth Engine

Ensure your Google Earth Engine account is authorized and your `project_id` is set in `config.yaml`:

```powershell
# From the LiveData directory:
..\.venv\Scripts\earthengine.exe authenticate

# Or using Python directly:
..\.venv\Scripts\python.exe -c "import ee; ee.Authenticate()"
```

Select your Google account in the browser and grant permission.

---

## 2. Usage Commands

All commands below assume you are inside the `LiveData` directory (`d:\DEV\Projects\AlphaZero\src\Backend\Container\LiveData`):

### Smart Refresh (Default)
Runs a single cycle, fetching only expired or missing tiers (cached tiers are loaded from disk):
```powershell
..\.venv\Scripts\python.exe pipeline.py
```

### Full Fresh Pull
Bypasses all cache files and re-fetches all static, periodic, and real-time tiers:
```powershell
..\.venv\Scripts\python.exe pipeline.py --fresh
```

### Daemon Mode
Runs continuously and triggers automatically every 4 hours aligned with IST windows (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST):
```powershell
..\.venv\Scripts\python.exe pipeline.py --daemon
```

### Dry Run / Preview
Inspects your regions, bounding boxes, grid resolution, and point counts without making any GEE API calls:
```powershell
..\.venv\Scripts\python.exe pipeline.py --dry-run
```

---

## 3. Configuration (`config.yaml`)

- **`regions`**: Add or remove rectangle bounding boxes (`min_lat`, `max_lat`, `min_lon`, `max_lon`, `grid_resolution_km`). Overlapping points are automatically deduplicated.
- **`gee.project_id`**: Your Google Cloud / Earth Engine project ID (`alphazero-506716`).
- **`schedule.interval_hours`**: Refresh cadence in hours (default: `4`).
- **`output`**: Directory (`data`) and filename (`output.csv`).