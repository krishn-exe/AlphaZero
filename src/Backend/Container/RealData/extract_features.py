#!/usr/bin/env python3
"""
Historical Landslide Feature Extraction Pipeline
=================================================
Processes `RealData/India_Landslides.csv` to extract the 24 geospatial features
corresponding to each event's specific location and historical date.

Imports existing logic from LiveData modules:
  - GEE Static Tier (SRTM DEM, SoilGrids, ESA WorldCover)
  - MODIS historical NDVI / Vegetation Cover
  - CHIRPS historical precipitation (24h and 3-day cumulative)
  - ERA5-Land historical soil moisture, temperature, and humidity
  - USGS historical earthquake activity (90-day window per event)
  - RUSLE soil erosion model & historical landslide counts
  - Appends `Label = 1` for all rows

Output:
  `RealData/India_Landslides_with_features.csv`
"""

import logging
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import ee
import numpy as np
import pandas as pd
import requests

# ==============================================================================
# Path Setup & Imports
# ==============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
CONTAINER_DIR = SCRIPT_DIR.parent
LIVEDATA_DIR = CONTAINER_DIR / "LiveData"

sys.path.insert(0, str(LIVEDATA_DIR))

from external_features import (
    _haversine_distances_km,
    compute_soil_erosion_rate,
    fetch_historical_landslides,
    fetch_road_distances,
)
from gee_fetcher import (
    STATIC_SCALE,
    _grid_to_fc,
    _sample_image,
    fetch_static_features,
)
from pipeline import OUTPUT_COLUMNS, initialize_gee, load_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("historical_pipeline")


# ==============================================================================
# 1. Load & Clean RealData
# ==============================================================================

def load_and_clean_landslides(csv_path: Path) -> pd.DataFrame:
    """Load India_Landslides.csv, clean coordinates and parse dates."""
    logger.info(f"Loading input landslide records from {csv_path.name}...")
    df = pd.read_csv(csv_path)

    # Clean latitude and longitude (remove trailing characters like '15.4014a')
    df["latitude"] = df["latitude"].astype(str).str.replace(r"[^0-9.-]", "", regex=True)
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    # Standardize column names to match pipeline conventions
    df["Latitude"] = df["latitude"]
    df["Longitude"] = df["longitude"]

    # Parse date and time
    df["parsed_date"] = pd.to_datetime(df["event_date"], errors="coerce")
    df["parsed_time"] = df["event_time"].astype(str).str.strip()

    # Form formatted Fetch_Timestamp
    df["Fetch_Timestamp"] = (
        df["parsed_date"].dt.strftime("%Y-%m-%d") + " " + df["parsed_time"] + " IST"
    )

    # Drop any records with unparseable coordinates or dates
    valid_mask = df["Latitude"].notna() & df["Longitude"].notna() & df["parsed_date"].notna()
    cleaned = df[valid_mask].reset_index(drop=True)
    logger.info(f"Loaded {len(cleaned)} valid landslide records (dropped {len(df) - len(cleaned)} invalid).")
    return cleaned


# ==============================================================================
# 2. Historical Earthquake Activity (USGS API for 90-day window per event)
# ==============================================================================

def fetch_historical_earthquakes_catalog(
    min_lat: float, max_lat: float, min_lon: float, max_lon: float,
    start_year: int, end_year: int
) -> list[dict]:
    """Fetch all earthquakes (M>=2.5) across India for the historical date span."""
    logger.info(f"Fetching USGS earthquake catalog for India ({start_year}-{end_year})...")
    url = "https://earthquake.usgs.gov/fdsnws/event/1/query"
    earthquakes = []

    # Query in 2-year chunks to respect USGS limit
    for y in range(start_year, end_year + 1, 2):
        y_end = min(y + 2, end_year + 1)
        params = {
            "format": "geojson",
            "starttime": f"{y}-01-01",
            "endtime": f"{y_end}-01-01",
            "minmagnitude": 2.5,
            "minlatitude": min_lat - 2.0,
            "maxlatitude": max_lat + 2.0,
            "minlongitude": min_lon - 2.0,
            "maxlongitude": max_lon + 2.0,
            "orderby": "time",
        }
        try:
            resp = requests.get(url, params=params, timeout=45)
            resp.raise_for_status()
            data = resp.json()
            for feat in data.get("features", []):
                coords = feat["geometry"]["coordinates"]
                props = feat["properties"]
                if props.get("mag") is not None and props.get("time") is not None:
                    eq_time = datetime.fromtimestamp(props["time"] / 1000.0, tz=timezone.utc)
                    earthquakes.append({
                        "longitude": coords[0],
                        "latitude": coords[1],
                        "magnitude": props["mag"],
                        "time": eq_time,
                    })
            logger.info(f"  USGS {y}-{y_end}: retrieved {len(data.get('features', []))} events.")
        except Exception as exc:
            logger.warning(f"  USGS fetch failed for {y}-{y_end}: {exc}")

    logger.info(f"Total historical earthquakes cached: {len(earthquakes)}")
    return earthquakes


def compute_historical_earthquake_activity(
    df: pd.DataFrame, earthquakes: list[dict], lookback_days: int = 90, max_radius_km: float = 200.0
) -> pd.Series:
    """Compute distance-weighted earthquake activity within 90 days before each landslide."""
    logger.info("Computing historical earthquake activity for each landslide...")
    activity = np.zeros(len(df), dtype=np.float64)

    if not earthquakes:
        return pd.Series(activity, index=df.index, name="Earthquake_Activity")

    eq_lats = np.array([e["latitude"] for e in earthquakes], dtype=np.float64)
    eq_lons = np.array([e["longitude"] for e in earthquakes], dtype=np.float64)
    eq_mags = np.array([e["magnitude"] for e in earthquakes], dtype=np.float64)
    eq_times = [e["time"].date() for e in earthquakes]

    # Pre-index earthquakes by year-month for fast lookup
    for i, row in df.iterrows():
        event_dt = row["parsed_date"].date()
        start_dt = event_dt - timedelta(days=lookback_days)

        # Filter earthquakes in 90-day lookback window
        window_mask = np.array([start_dt <= t <= event_dt for t in eq_times])
        if not np.any(window_mask):
            continue

        w_lats = eq_lats[window_mask]
        w_lons = eq_lons[window_mask]
        w_mags = eq_mags[window_mask]

        # Compute Haversine distance
        dists = _haversine_distances_km(w_lats, w_lons, row["Latitude"], row["Longitude"])
        valid_radius = dists <= max_radius_km

        if np.any(valid_radius):
            scores = w_mags[valid_radius] / (1.0 + dists[valid_radius] / 50.0)
            activity[i] = np.sum(scores)

    logger.info(f"Earthquake activity: min={activity.min():.2f}, max={activity.max():.2f}, mean={activity.mean():.2f}")
    return pd.Series(activity, index=df.index, name="Earthquake_Activity")


# ==============================================================================
# 3. GEE Historical Periodic & Realtime Features (MODIS, CHIRPS, ERA5-Land)
# ==============================================================================

def sample_historical_gee_features(df: pd.DataFrame, batch_size: int = 50) -> pd.DataFrame:
    """
    Extract NDVI, rainfall (24h/3d), soil moisture/saturation, temperature,
    humidity, and soil temperature for each point's specific date using
    parallel server-side Earth Engine mapping.
    """
    logger.info(f"Extracting date-specific satellite features via Earth Engine for {len(df)} points...")

    res_df = pd.DataFrame(index=df.index)
    res_df["Rainfall_mm"] = 0.0
    res_df["Rainfall_3Day"] = 0.0
    res_df["NDVI_Index"] = 0.5
    res_df["Vegetation_Cover"] = 0.5
    res_df["Soil_Moisture_Content"] = 0.25
    res_df["Soil_Saturation"] = 0.5
    res_df["Soil_Temperature_C"] = 22.0
    res_df["Temperature_C"] = 24.0
    res_df["Humidity_percent"] = 75.0

    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").select("precipitation")
    modis = ee.ImageCollection("MODIS/061/MOD13Q1").select("NDVI")
    era5 = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_RAW")

    def sample_all_dynamic(feat):
        d = ee.Date(feat.get("date"))
        geom = feat.geometry()

        # Rainfall (24h & 3-Day cumulative)
        r24 = chirps.filterDate(d, d.advance(1, "day")).sum().reduceRegion(
            ee.Reducer.first(), geom, 5000
        ).get("precipitation")
        r3d = chirps.filterDate(d.advance(-2, "day"), d.advance(1, "day")).sum().reduceRegion(
            ee.Reducer.first(), geom, 5000
        ).get("precipitation")

        # MODIS NDVI (16-day window around date)
        m_img = modis.filterDate(d.advance(-16, "day"), d.advance(16, "day")).mean().multiply(0.0001)
        ndvi_val = m_img.reduceRegion(ee.Reducer.first(), geom, 500).get("NDVI")

        # ERA5-Land Daily Weather & Soil
        e_img = era5.filterDate(d, d.advance(1, "day")).first()
        e_stats = e_img.reduceRegion(ee.Reducer.first(), geom, 11132)

        return feat.set({
            "Rainfall_mm": r24,
            "Rainfall_3Day": r3d,
            "NDVI_Index": ndvi_val,
            "temperature_2m": e_stats.get("temperature_2m"),
            "dewpoint_temperature_2m": e_stats.get("dewpoint_temperature_2m"),
            "volumetric_soil_water_layer_1": e_stats.get("volumetric_soil_water_layer_1"),
            "skin_temperature": e_stats.get("skin_temperature"),
        })

    total_points = len(df)
    for start_idx in range(0, total_points, batch_size):
        end_idx = min(start_idx + batch_size, total_points)
        batch_slice = df.iloc[start_idx:end_idx]
        logger.info(f"Processing GEE batch {start_idx+1}-{end_idx} / {total_points}...")

        feats = []
        for orig_idx, row in batch_slice.iterrows():
            f = ee.Feature(
                ee.Geometry.Point([float(row["Longitude"]), float(row["Latitude"])]),
                {
                    "date": row["parsed_date"].strftime("%Y-%m-%d"),
                    "idx": int(orig_idx),
                },
            )
            feats.append(f)

        try:
            fc = ee.FeatureCollection(feats)
            sampled = fc.map(sample_all_dynamic).getInfo()

            for item in sampled.get("features", []):
                props = item.get("properties", {})
                idx = props.get("idx")
                if idx is None or idx not in res_df.index:
                    continue

                # 1. Rainfall
                r24 = props.get("Rainfall_mm")
                r3d = props.get("Rainfall_3Day")
                if r24 is not None:
                    res_df.loc[idx, "Rainfall_mm"] = round(float(r24), 2)
                if r3d is not None:
                    res_df.loc[idx, "Rainfall_3Day"] = round(float(r3d), 2)

                # 2. NDVI & Vegetation Cover
                ndvi = props.get("NDVI_Index")
                if ndvi is not None:
                    ndvi_val = float(ndvi)
                    res_df.loc[idx, "NDVI_Index"] = round(ndvi_val, 4)
                    fvc = max(0.0, min(1.0, (ndvi_val - 0.05) / 0.80))
                    res_df.loc[idx, "Vegetation_Cover"] = round(fvc, 4)

                # 3. Weather (Temp & Humidity)
                t2m_k = props.get("temperature_2m")
                d2m_k = props.get("dewpoint_temperature_2m")
                if t2m_k is not None:
                    temp_c = float(t2m_k) - 273.15
                    res_df.loc[idx, "Temperature_C"] = round(temp_c, 2)
                    if d2m_k is not None:
                        td_c = float(d2m_k) - 273.15
                        rh = 100.0 * (
                            math.exp((17.625 * td_c) / (243.04 + td_c))
                            / math.exp((17.625 * temp_c) / (243.04 + temp_c))
                        )
                        res_df.loc[idx, "Humidity_percent"] = round(min(max(rh, 5.0), 100.0), 1)

                # 4. Soil moisture & saturation
                sm = props.get("volumetric_soil_water_layer_1")
                if sm is not None:
                    sm_val = float(sm)
                    res_df.loc[idx, "Soil_Moisture_Content"] = round(sm_val, 4)
                    res_df.loc[idx, "Soil_Saturation"] = round(min(sm_val / 0.45, 1.0), 4)

                # 5. Soil temperature
                st = props.get("skin_temperature")
                if st is not None:
                    res_df.loc[idx, "Soil_Temperature_C"] = round(float(st) - 273.15, 2)

        except Exception as exc:
            logger.warning(f"Batch {start_idx+1}-{end_idx} error ({exc}) -- using ambient fallbacks.")

    return res_df


# ==============================================================================
# Main Orchestrator
# ==============================================================================

def main():
    input_file = SCRIPT_DIR / "India_Landslides.csv"
    output_file = SCRIPT_DIR / "India_Landslides_with_features.csv"

    if not input_file.exists():
        logger.error(f"Input file not found: {input_file}")
        sys.exit(1)

    # 1. Clean input
    df = load_and_clean_landslides(input_file)

    # 2. Init Earth Engine
    config = load_config()
    initialize_gee(config["gee"])

    # 3. Tier 1: Static Features (DEM elevation, slope, aspect, soil textures, land use, water proximity)
    logger.info("Sampling Tier 1 Static terrain & soil features...")
    static_df = fetch_static_features(df[["Latitude", "Longitude"]])

    # 4. Static External Features (road distances & historical landslides count)
    logger.info("Computing proximity to roads & neighboring historical landslides...")
    # Bounding regions for road distance
    regions = [{
        "name": "India Bounding Box",
        "bbox": {
            "min_lat": float(df["Latitude"].min()),
            "max_lat": float(df["Latitude"].max()),
            "min_lon": float(df["Longitude"].min()),
            "max_lon": float(df["Longitude"].max()),
        },
        "grid_resolution_km": 1.0,
    }]
    road_distances = fetch_road_distances(df[["Latitude", "Longitude"]], regions)
    landslide_counts = fetch_historical_landslides(df[["Latitude", "Longitude"]], regions)

    # 5. Tier 4: Historical Earthquake Activity
    min_year = int(df["parsed_date"].dt.year.min())
    max_year = int(df["parsed_date"].dt.year.max())
    earthquakes = fetch_historical_earthquakes_catalog(
        min_lat=float(df["Latitude"].min()),
        max_lat=float(df["Latitude"].max()),
        min_lon=float(df["Longitude"].min()),
        max_lon=float(df["Longitude"].max()),
        start_year=min_year,
        end_year=max_year,
    )
    eq_activity = compute_historical_earthquake_activity(df, earthquakes)

    # 6. Tier 2 & Tier 3: Date-specific NDVI, Rainfall, Weather, Soil
    dyn_df = sample_historical_gee_features(df)

    # ==========================================================================
    # Merge All Features
    # ==========================================================================
    logger.info("Merging all features into final training schema...")
    output = df[["Latitude", "Longitude", "Fetch_Timestamp"]].copy()

    # Static features merge
    for col in static_df.columns:
        if col not in ["Latitude", "Longitude", "grid_idx"]:
            output[col] = static_df[col].values

    # Add external static features
    output["Distance_to_Road_m"] = road_distances.values
    output["Historical_Landslide_Count"] = landslide_counts.values

    # Add earthquake activity
    output["Earthquake_Activity"] = eq_activity.values

    # Add dynamic date features
    for col in dyn_df.columns:
        output[col] = dyn_df[col].values

    # Compute Soil Erosion Rate (RUSLE model)
    output["Soil_Erosion_Rate"] = compute_soil_erosion_rate(output).values

    # Ensure exact column order matching pipeline
    for col in OUTPUT_COLUMNS:
        if col not in output.columns:
            output[col] = 0.0
    output = output[OUTPUT_COLUMNS]

    # Add requested Label column (= 1 for all real historical landslides)
    output["Label"] = 1

    # Save final CSV
    output.to_csv(output_file, index=False)
    logger.info("=" * 65)
    logger.info(f"SUCCESS: Generated features for {len(output)} historical landslide events!")
    logger.info(f"Saved to: {output_file.resolve()}")
    logger.info(f"Columns ({len(output.columns)}): {list(output.columns)}")
    logger.info("=" * 65)


if __name__ == "__main__":
    main()
