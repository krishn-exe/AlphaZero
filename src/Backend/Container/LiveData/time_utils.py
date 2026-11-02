"""
Time Utilities for IST Clock Verification
=========================================
Fetches and verifies real-time Indian Standard Time (IST) from public time APIs
with automatic multi-source fallback, ensuring scheduled window calculations
do not rely strictly on local system clock drifts or tampering.
"""

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests

logger = logging.getLogger("time_utils")
IST = ZoneInfo("Asia/Kolkata")


def get_current_ist_time(timeout: float = 4.0) -> datetime:
    """
    Get current time in IST by querying public time APIs.
    Tries primary timeapi.io, falls back to time.akamai.com timestamp,
    and falls back to system clock in IST if all network calls fail.
    """
    # 1. Primary: timeapi.io
    try:
        resp = requests.get(
            "https://timeapi.io/api/time/current/zone?timeZone=Asia/Kolkata",
            timeout=timeout,
        )
        if resp.status_code == 200:
            data = resp.json()
            # dateTime format: "2026-11-02T12:35:55.1615451"
            dt_str = data["dateTime"].split(".")[0]
            naive_dt = datetime.fromisoformat(dt_str)
            return naive_dt.replace(tzinfo=IST)
    except Exception as e:
        logger.warning(f"timeapi.io failed ({e}), trying Akamai time fallback...")

    # 2. Secondary: time.akamai.com (returns high-precision epoch timestamp)
    try:
        resp = requests.get("https://time.akamai.com", timeout=timeout)
        if resp.status_code == 200:
            epoch = float(resp.text.strip())
            return datetime.fromtimestamp(epoch, tz=timezone.utc).astimezone(IST)
    except Exception as e:
        logger.warning(f"Akamai time API failed ({e}), falling back to local system clock...")

    # 3. Fallback: Local system clock with IST timezone
    return datetime.now(IST)
