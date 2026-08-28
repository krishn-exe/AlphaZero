"""
Grid Generator — creates a regular lat/lon sample grid within a bounding box.

Used to define the spatial points at which all GEE datasets are sampled.
The grid spacing is configurable in km; geodesic conversion accounts for
latitude-dependent longitude spacing.
"""

import numpy as np
import pandas as pd
from pathlib import Path


# Earth's mean radius (km) — used for degree ↔ km conversion
_EARTH_RADIUS_KM = 6371.0
_DEG_PER_KM_LAT = 1.0 / 111.32  # ~0.00899° per km


def generate_grid(bbox: dict, resolution_km: float) -> pd.DataFrame:
    """
    Generate a regular latitude/longitude grid.

    Parameters
    ----------
    bbox : dict
        Bounding box with keys: min_lat, max_lat, min_lon, max_lon
    resolution_km : float
        Spacing between grid points in kilometres.

    Returns
    -------
    pd.DataFrame
        Columns: Latitude, Longitude  (one row per sample point)
    """
    lat_step = resolution_km * _DEG_PER_KM_LAT

    # Longitude step varies with latitude — use midpoint for uniform spacing
    mid_lat = (bbox["min_lat"] + bbox["max_lat"]) / 2
    lon_step = resolution_km / (111.32 * np.cos(np.radians(mid_lat)))

    lats = np.arange(bbox["min_lat"], bbox["max_lat"] + lat_step * 0.5, lat_step)
    lons = np.arange(bbox["min_lon"], bbox["max_lon"] + lon_step * 0.5, lon_step)

    # Meshgrid → flat arrays
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    df = pd.DataFrame({
        "Latitude": np.round(lat_grid.flatten(), 6),
        "Longitude": np.round(lon_grid.flatten(), 6),
    })

    return df


def save_grid(df: pd.DataFrame, filepath: str):
    """Persist the grid to CSV."""
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(filepath, index=False)


def load_grid(filepath: str) -> pd.DataFrame:
    """Load a previously saved grid from CSV."""
    return pd.read_csv(filepath)
