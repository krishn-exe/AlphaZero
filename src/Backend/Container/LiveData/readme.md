
## 1. Authenticate Earth Engine
```powershell
# From the Container directory:
.\.venv\Scripts\earthengine.exe authenticate

Select your Google account in the browser and grant permission.

---

## 2. Usage Commands

Be in the `Container` directory

- ### Smart Refresh (Default)
Runs a single cycle, fetching only expired or missing tiers (cached tiers are loaded from disk):
```powershell
.\.venv\Scripts\python.exe LiveData\pipeline.py
```

- ### Full Fresh Pull
Bypasses all cache files and re-fetches all static, periodic, and real-time tiers:
```powershell
.\.venv\Scripts\python.exe LiveData\pipeline.py --fresh
```

- ### Daemon Mode
Runs continuously and triggers automatically every 4 hours aligned with IST windows (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST):
```powershell
.\.venv\Scripts\python.exe LiveData\pipeline.py --daemon
```

- ### Dry Run
```powershell
.\.venv\Scripts\python.exe LiveData\pipeline.py --dry-run

```