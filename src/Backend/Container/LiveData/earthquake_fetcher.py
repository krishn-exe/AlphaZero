"""
Earthquake Fetcher — queries the USGS FDSNWS API for seismic activity.

Computes a distance-weighted earthquake activity index for each grid point
based on recent earthquakes within a configurable radius.

API docs: https://earthquake.usgs.gov/fdsnws/event/1/
No authentication required.
"""

import logging
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

USGS_API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

# Decay factor (km) for distance weighting — controls how fast
# earthquake influence drops with distance.
_DISTANCE_DECAY_KM = 50.0


def _haversine_km(lat1, lon1, lat2, lon2):
    """
    Vectorised Haversine distance in kilometres.

    Parameters can be scalars or numpy arrays (broadcasting supported).
    """
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def fetch_earthquakes(
    bbox: dict,
    lookback_days: int = 90,
    min_magnitude: float = 2.5,
) -> list[dict]:
    """
    Fetch earthquake events from the USGS FDSNWS API.

    Returns a list of dicts, each with: latitude, longitude, magnitude, depth_km.
    """
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=lookback_days)

    # Pad the bounding box by 2° to capture earthquakes whose shaking
    # could reach the region even if the epicentre is outside it.
    params = {
        "format": "geojson",
        "starttime": start_time.strftime("%Y-%m-%d"),
        "endtime": end_time.strftime("%Y-%m-%d"),
        "minmagnitude": min_magnitude,
        "minlatitude": bbox["min_lat"] - 2.0,
        "maxlatitude": bbox["max_lat"] + 2.0,
        "minlongitude": bbox["min_lon"] - 2.0,
        "maxlongitude": bbox["max_lon"] + 2.0,
        "orderby": "magnitude",
    }

    try:
        resp = requests.get(USGS_API_URL, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as exc:
        logger.warning(f"USGS API request failed: {exc}. Returning empty earthquake list.")
        return []
    except ValueError as exc:
        logger.warning(f"USGS API returned invalid JSON: {exc}.")
        return []

    earthquakes = []
    for feature in data.get("features", []):
        coords = feature["geometry"]["coordinates"]  # [lon, lat, depth]
        props = feature["properties"]
        if props.get("mag") is not None:
            earthquakes.append({
                "longitude": coords[0],
                "latitude": coords[1],
                "depth_km": coords[2],
                "magnitude": props["mag"],
            })

    logger.info(
        f"USGS API returned {len(earthquakes)} earthquake(s) "
        f"(M≥{min_magnitude}, last {lookback_days} days)"
    )
    return earthquakes


def compute_earthquake_activity(
    grid_df: pd.DataFrame,
    bbox: dict,
    lookback_days: int = 90,
    min_magnitude: float = 2.5,
    max_radius_km: float = 200.0,
) -> pd.Series:
    """
    Compute an earthquake activity index for every grid point.

    For each point, sums:
        magnitude / (1 + distance_km / decay_factor)
    over all earthquakes within *max_radius_km*.

    This produces continuous values in roughly the 0–10 range,
    matching the distribution seen in the ML training dataset.

    Parameters
    ----------
    grid_df : pd.DataFrame
        Must have Latitude and Longitude columns.
    bbox : dict
        Region bounding box (used to query USGS API).
    lookback_days, min_magnitude, max_radius_km
        API and computation parameters.

    Returns
    -------
    pd.Series
        Earthquake_Activity values aligned to grid_df's index.
    """
    earthquakes = fetch_earthquakes(bbox, lookback_days, min_magnitude)

    activity = np.zeros(len(grid_df), dtype=np.float64)

    if not earthquakes:
        logger.info("No earthquakes found — activity set to 0 for all points.")
        return pd.Series(activity, index=grid_df.index, name="Earthquake_Activity")

    grid_lats = grid_df["Latitude"].values
    grid_lons = grid_df["Longitude"].values

    for eq in earthquakes:
        distances = _haversine_km(grid_lats, grid_lons, eq["latitude"], eq["longitude"])
        within_radius = distances <= max_radius_km
        # Distance-weighted contribution: decays smoothly with distance
        contribution = np.where(
            within_radius,
            eq["magnitude"] / (1.0 + distances / _DISTANCE_DECAY_KM),
            0.0,
        )
        activity += contribution

    logger.info(
        f"Earthquake activity — min: {activity.min():.3f}, "
        f"max: {activity.max():.3f}, mean: {activity.mean():.3f}"
    )

    return pd.Series(activity, index=grid_df.index, name="Earthquake_Activity")
