"""
Grid Generator -- creates regular lat/lon sample grids within bounding boxes.

Used to define the spatial points at which all GEE datasets are sampled.
The grid is snapped to a fixed national origin (Karaundi, Madhya Pradesh --
the geographic center of India) to guarantee that grid points are globally
idempotent: any two bounding boxes evaluated at the same resolution will
produce identical, perfectly aligned sample coordinates in their overlapping regions.

Supports generating a combined grid across N rectangle geometries, with
automatic deduplication of overlapping points.
"""

import numpy as np
import pandas as pd
from pathlib import Path


# Fixed geographic origin: Karaundi, Katni District, Madhya Pradesh
# (Official geographic center of India: ~23° 30' 36" N, 80° 19' 48" E)
ORIGIN_LAT = 23.510000
ORIGIN_LON = 80.330000

# Earth geodesy constants
_EARTH_RADIUS_KM = 6371.0
_DEG_PER_KM_LAT = 1.0 / 111.32  # ~0.0089831 deg per km

# Fixed longitude degree step anchored at Karaundi's latitude (~23.51°N)
# Minimizes longitude distortion symmetrically across India's north and south
_DEG_PER_KM_LON = 1.0 / (111.32 * np.cos(np.radians(ORIGIN_LAT)))  # ~0.0097964 deg per km


def generate_grid(
    bbox: dict,
    resolution_km: float,
    origin_lat: float = ORIGIN_LAT,
    origin_lon: float = ORIGIN_LON,
) -> pd.DataFrame:
    """
    Generate an idempotent regular latitude/longitude grid for a single bounding box,
    snapped to a fixed national origin (Karaundi, MP).

    Any two overlapping bounding boxes using the same resolution_km will produce
    strictly identical coordinates in their overlapping area.

    Parameters
    ----------
    bbox : dict
        Bounding box with keys: min_lat, max_lat, min_lon, max_lon
    resolution_km : float
        Spacing between grid points in kilometres.
    origin_lat : float, optional
        Reference origin latitude (default: Karaundi, MP 23.51°N).
    origin_lon : float, optional
        Reference origin longitude (default: Karaundi, MP 80.33°E).

    Returns
    -------
    pd.DataFrame
        Columns: Latitude, Longitude  (one row per sample point)
    """
    lat_step = resolution_km * _DEG_PER_KM_LAT
    lon_step = resolution_km * _DEG_PER_KM_LON

    # Snap to the global origin lattice
    k_min = int(np.ceil((bbox["min_lat"] - origin_lat) / lat_step))
    k_max = int(np.floor((bbox["max_lat"] - origin_lat) / lat_step))
    if k_max < k_min:
        mid = (bbox["min_lat"] + bbox["max_lat"]) / 2.0
        k = int(np.round((mid - origin_lat) / lat_step))
        lats = np.array([origin_lat + k * lat_step])
    else:
        lats = origin_lat + np.arange(k_min, k_max + 1) * lat_step

    m_min = int(np.ceil((bbox["min_lon"] - origin_lon) / lon_step))
    m_max = int(np.floor((bbox["max_lon"] - origin_lon) / lon_step))
    if m_max < m_min:
        mid = (bbox["min_lon"] + bbox["max_lon"]) / 2.0
        m = int(np.round((mid - origin_lon) / lon_step))
        lons = np.array([origin_lon + m * lon_step])
    else:
        lons = origin_lon + np.arange(m_min, m_max + 1) * lon_step

    # Meshgrid -> flat arrays
    lon_grid, lat_grid = np.meshgrid(lons, lats)

    df = pd.DataFrame({
        "Latitude": np.round(lat_grid.flatten(), 6),
        "Longitude": np.round(lon_grid.flatten(), 6),
    })

    return df


def generate_multi_grid(regions: list[dict]) -> pd.DataFrame:
    """
    Generate grids for N regions and concatenate into a single DataFrame.

    Overlapping rectangles are handled by deduplicating on (Latitude, Longitude)
    so no grid point appears twice in the output.

    Parameters
    ----------
    regions : list[dict]
        Each dict has keys: name, bbox, grid_resolution_km

    Returns
    -------
    pd.DataFrame
        Columns: Latitude, Longitude  (deduplicated)
    """
    frames = []
    for region in regions:
        grid = generate_grid(region["bbox"], region["grid_resolution_km"])
        frames.append(grid)

    combined = pd.concat(frames, ignore_index=True)

    # Deduplicate points that fall in overlapping rectangles
    before = len(combined)
    combined = combined.drop_duplicates(subset=["Latitude", "Longitude"]).reset_index(drop=True)
    after = len(combined)
    if before != after:
        import logging
        logging.getLogger(__name__).info(
            f"Overlap dedup: {before} -> {after} points ({before - after} duplicates removed)"
        )

    return combined


def compute_combined_bbox(regions: list[dict]) -> dict:
    """
    Compute the bounding box that encloses all regions.

    Used for earthquake API queries that need a single bbox.
    """
    return {
        "min_lat": min(r["bbox"]["min_lat"] for r in regions),
        "max_lat": max(r["bbox"]["max_lat"] for r in regions),
        "min_lon": min(r["bbox"]["min_lon"] for r in regions),
        "max_lon": max(r["bbox"]["max_lon"] for r in regions),
    }


def save_grid(df: pd.DataFrame, filepath: str):
    """Persist the grid to CSV."""
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(filepath, index=False)


def load_grid(filepath: str) -> pd.DataFrame:
    """Load a previously saved grid from CSV."""
    return pd.read_csv(filepath)
