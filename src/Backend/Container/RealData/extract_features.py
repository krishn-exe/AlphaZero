#!/usr/bin/env python3
"""
Historical Landslide Feature Extraction Pipeline
=================================================
Processes an input CSV (landslide events or negative / pseudo-absence points)
to extract the 24 geospatial features corresponding to each event's specific
location and historical date.

Imports existing logic from LiveData modules:
  - GEE Static Tier (SRTM DEM, SoilGrids, ESA WorldCover)
  - MODIS historical NDVI / Vegetation Cover
  - CHIRPS historical precipitation (24h and 3-day cumulative)
  - ERA5-Land historical soil moisture, temperature, and humidity
  - USGS historical earthquake activity (90-day window per event)
  - RUSLE soil erosion model & historical landslide counts
  - Appends requested or inferred `Label` column

Usage:
  python extract_features.py --input <path_to_csv> --output-label <0 or 1>
  python extract_features.py --csv <path_to_csv> --label <0 or 1>
  python extract_features.py <path_to_csv> --output-label 0
"""

import argparse
import logging
import math
import sys
import time
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
    """Load input CSV records (landslides or negative points), clean coordinates and parse dates."""
    logger.info(f"Loading input records from {csv_path.name}...")
    df = pd.read_csv(csv_path)

    # Normalize column names for lat/lon
    lat_col = next((c for c in ["latitude", "Latitude", "lat", "Lat", "LATITUDE"] if c in df.columns), None)
    lon_col = next((c for c in ["longitude", "Longitude", "lon", "Lon", "lng", "Lng", "LONGITUDE"] if c in df.columns), None)
    date_col = next((c for c in ["event_date", "Date", "date", "Event_Date", "datetime", "DateTime", "timestamp", "Timestamp", "dt"] if c in df.columns), None)
    time_col = next((c for c in ["event_time", "Time", "time", "Event_Time", "tm"] if c in df.columns), None)

    if not lat_col or not lon_col:
        raise ValueError(f"Could not find latitude/longitude columns in {csv_path}")

    # Clean latitude and longitude (remove trailing characters like '15.4014a')
    df["latitude"] = df[lat_col].astype(str).str.replace(r"[^0-9.-]", "", regex=True)
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = df[lon_col].astype(str).str.replace(r"[^0-9.-]", "", regex=True)
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    # Standardize column names to match pipeline conventions
    df["Latitude"] = df["latitude"]
    df["Longitude"] = df["longitude"]

    # Parse date and time
    df["parsed_date"] = pd.to_datetime(df[date_col], errors="coerce") if date_col else pd.Timestamp.now()
    if time_col and time_col in df.columns:
        df["parsed_time"] = df[time_col].astype(str).str.strip().replace("nan", "0:00")
    else:
        df["parsed_time"] = "0:00"

    # Form formatted Fetch_Timestamp
    df["Fetch_Timestamp"] = (
        df["parsed_date"].dt.strftime("%Y-%m-%d") + " " + df["parsed_time"] + " IST"
    )

    # Drop any records with unparseable coordinates or dates
    valid_mask = df["Latitude"].notna() & df["Longitude"].notna() & df["parsed_date"].notna()
    cleaned = df[valid_mask].reset_index(drop=True)
    logger.info(f"Loaded {len(cleaned)} valid records (dropped {len(df) - len(cleaned)} invalid).")
    return cleaned


# ==============================================================================
# 2. Historical Earthquake Activity (USGS API for 90-day window per event)
# ==============================================================================

def fetch_historical_earthquakes_catalog(
    min_lat: float, max_lat: float, min_lon: float, max_lon: float,
    start_year: int, end_year: int
) -> list[dict]:
    """Fetch all earthquakes across the bounding box for the historical date span."""
    logger.info(f"Fetching USGS earthquake catalog ({start_year}-{end_year})...")
    url = "https://earthquake.usgs.gov/fdsnws/event/1/query"
    earthquakes = []

    # Check if bounds cover a large or global area
    is_global_lon = (max_lon - min_lon >= 350.0) or (min_lon <= -178.0 and max_lon >= 178.0)
    is_wide_lat = (max_lat - min_lat >= 60.0)
    is_global = is_global_lon or is_wide_lat

    # Threshold: M>=2.5 for regional queries, M>=4.0 for global (to avoid exceeding USGS 20,000 event limit)
    min_mag = 4.0 if is_global else 2.5
    step = 1 if is_global else 2

    # Query in annual chunks to respect USGS limits
    for y in range(start_year, end_year + 1, step):
        y_end = min(y + step, end_year + 1)
        params = {
            "format": "geojson",
            "starttime": f"{y}-01-01",
            "endtime": f"{y_end}-01-01",
            "minmagnitude": min_mag,
            "orderby": "time",
        }

        # Longitude clamping: omit if covering entire globe
        if not is_global_lon:
            params["minlongitude"] = max(-180.0, min_lon - 2.0)
            params["maxlongitude"] = min(180.0, max_lon + 2.0)

        # Latitude clamping
        q_min_lat = max(-90.0, min_lat - 2.0)
        q_max_lat = min(90.0, max_lat + 2.0)
        if q_min_lat > -90.0:
            params["minlatitude"] = q_min_lat
        if q_max_lat < 90.0:
            params["maxlatitude"] = q_max_lat

        for attempt_mag in [min_mag, min_mag + 0.5]:
            params["minmagnitude"] = attempt_mag
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
                logger.info(f"  USGS {y}-{y_end} (M>={attempt_mag}): retrieved {len(data.get('features', []))} events.")
                break
            except Exception as exc:
                if attempt_mag == min_mag and is_global:
                    logger.warning(f"  USGS fetch for {y}-{y_end} failed at M>={attempt_mag} ({exc}), retrying with M>={attempt_mag+0.5}...")
                else:
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
    eq_ordinals = np.array([e["time"].date().toordinal() for e in earthquakes], dtype=np.int32)

    df_lats = df["Latitude"].values
    df_lons = df["Longitude"].values
    df_ordinals = np.array([dt.date().toordinal() for dt in df["parsed_date"]], dtype=np.int32)

    deg_radius = max_radius_km / 111.0 + 0.2

    for i in range(len(df)):
        ev_ord = df_ordinals[i]
        start_ord = ev_ord - lookback_days

        # Fast 90-day time window mask
        time_mask = (eq_ordinals >= start_ord) & (eq_ordinals <= ev_ord)
        if not np.any(time_mask):
            continue

        w_lats = eq_lats[time_mask]
        w_lons = eq_lons[time_mask]
        w_mags = eq_mags[time_mask]

        # Fast degree box pre-filter before Haversine
        lat_i = df_lats[i]
        lon_i = df_lons[i]
        box_mask = (np.abs(w_lats - lat_i) <= deg_radius) & (np.abs(w_lons - lon_i) <= deg_radius * 1.5)
        if not np.any(box_mask):
            continue

        c_lats = w_lats[box_mask]
        c_lons = w_lons[box_mask]
        c_mags = w_mags[box_mask]

        # Compute Haversine distance
        dists = _haversine_distances_km(c_lats, c_lons, lat_i, lon_i)
        valid_radius = dists <= max_radius_km

        if np.any(valid_radius):
            scores = c_mags[valid_radius] / (1.0 + dists[valid_radius] / 50.0)
            activity[i] = np.sum(scores)

    logger.info(f"Earthquake activity: min={activity.min():.2f}, max={activity.max():.2f}, mean={activity.mean():.2f}")
    return pd.Series(activity, index=df.index, name="Earthquake_Activity")


# ==============================================================================
# 3. GEE Historical Periodic & Realtime Features (MODIS, CHIRPS, ERA5-Land)
# ==============================================================================

def sample_historical_gee_features(
    df: pd.DataFrame, batch_size: int = 2500, checkpoint_path: Path | None = None
) -> pd.DataFrame:
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

    completed_indices = set()
    if checkpoint_path and checkpoint_path.exists():
        try:
            ckpt_df = pd.read_csv(checkpoint_path, index_col=0)
            common_cols = [c for c in res_df.columns if c in ckpt_df.columns]
            res_df.loc[ckpt_df.index, common_cols] = ckpt_df[common_cols]
            completed_indices = set(ckpt_df.index)
            logger.info(f"Loaded {len(completed_indices)} sampled rows from checkpoint: {checkpoint_path.name}")
        except Exception as exc:
            logger.warning(f"Failed to load checkpoint ({exc}), starting fresh.")

    chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").select("precipitation")
    modis = ee.ImageCollection("MODIS/061/MOD13Q1").select("NDVI")
    avhrr = ee.ImageCollection("NOAA/CDR/AVHRR/NDVI/V5").select("NDVI")
    era5 = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_RAW")

    def sample_all_dynamic(feat):
        d = ee.Date(feat.get("date"))
        geom = feat.geometry()

        # Rainfall (24h and 3-Day cumulative) via CHIRPS
        r24 = chirps.filterDate(d, d.advance(1, "day")).sum().reduceRegion(
            ee.Reducer.first(), geom, 5000
        ).get("precipitation")
        r3d = chirps.filterDate(d.advance(-2, "day"), d.advance(1, "day")).sum().reduceRegion(
            ee.Reducer.first(), geom, 5000
        ).get("precipitation")

        # MODIS NDVI (16-day window around date) with AVHRR / fallback for pre-2000 dates
        m_col = modis.filterDate(d.advance(-16, "day"), d.advance(16, "day"))
        a_col = avhrr.filterDate(d.advance(-16, "day"), d.advance(16, "day"))
        ndvi_img = ee.Image(
            ee.Algorithms.If(
                m_col.size().gt(0),
                m_col.mean().multiply(0.0001),
                ee.Algorithms.If(
                    a_col.size().gt(0),
                    a_col.mean().multiply(0.0001),
                    ee.Image.constant(0.5).rename("NDVI")
                )
            )
        )
        ndvi_val = ndvi_img.reduceRegion(ee.Reducer.first(), geom, 5000).get("NDVI")

        # ERA5-Land Daily Weather, Soil & Rainfall Fallback (covers 1950-present globally)
        e_img = era5.filterDate(d, d.advance(1, "day")).first()
        e_img_safe = ee.Image(ee.Algorithms.If(e_img, e_img, ee.Image.constant(0)))
        e_stats = e_img_safe.reduceRegion(ee.Reducer.first(), geom, 11132)

        # ERA5 3-day rainfall fallback (m -> mm)
        e3d_sum = era5.filterDate(d.advance(-2, "day"), d.advance(1, "day")).select("total_precipitation_sum").sum()
        e3d_val = e3d_sum.reduceRegion(ee.Reducer.first(), geom, 11132).get("total_precipitation_sum")

        return feat.set({
            "Rainfall_mm": r24,
            "Rainfall_3Day": r3d,
            "era5_precip_m": e_stats.get("total_precipitation_sum"),
            "era5_3d_precip_m": e3d_val,
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

        # Check if entire batch is already completed in checkpoint
        if completed_indices and all(idx in completed_indices for idx in batch_slice.index):
            continue

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

        sampled = None
        for attempt in range(1, 4):
            try:
                fc = ee.FeatureCollection(feats)
                sampled = fc.map(sample_all_dynamic).getInfo()
                break
            except Exception as exc:
                if attempt < 3:
                    logger.warning(f"Batch {start_idx+1}-{end_idx} attempt {attempt} failed: {exc}. Retrying in {attempt * 2}s...")
                    time.sleep(attempt * 2)
                else:
                    logger.warning(f"Batch {start_idx+1}-{end_idx} error after 3 attempts ({exc}) -- using ambient fallbacks.")

        if sampled:
            for item in sampled.get("features", []):
                props = item.get("properties", {})
                idx = props.get("idx")
                if idx is None or idx not in res_df.index:
                    continue

                # 1. Rainfall (CHIRPS primary, ERA5 fallback if outside CHIRPS coverage)
                r24 = props.get("Rainfall_mm")
                r3d = props.get("Rainfall_3Day")
                e_precip = props.get("era5_precip_m")
                e3d_precip = props.get("era5_3d_precip_m")

                if r24 is not None:
                    res_df.loc[idx, "Rainfall_mm"] = round(float(r24), 2)
                elif e_precip is not None:
                    res_df.loc[idx, "Rainfall_mm"] = round(float(e_precip) * 1000.0, 2)

                if r3d is not None:
                    res_df.loc[idx, "Rainfall_3Day"] = round(float(r3d), 2)
                elif e3d_precip is not None:
                    res_df.loc[idx, "Rainfall_3Day"] = round(float(e3d_precip) * 1000.0, 2)

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

        # Checkpoint progress after each batch
        if checkpoint_path:
            res_df.iloc[:end_idx].to_csv(checkpoint_path)

    return res_df


# ==============================================================================
# Main Orchestrator
# ==============================================================================

def parse_label(val: str):
    """Parse label value to int, float, or string."""
    try:
        f = float(val)
        if f.is_integer():
            return int(f)
        return f
    except ValueError:
        return val


def main():
    parser = argparse.ArgumentParser(
        description="Historical Landslide & Pseudo-Absence Feature Extraction Pipeline"
    )
    parser.add_argument(
        "csv_file",
        nargs="?",
        default=None,
        help="Optional positional path to input CSV file (e.g. RealData/nega_pts_3000_15000m_cleaned.csv)",
    )
    parser.add_argument(
        "--input", "-i", "--csv", "--file", "-f",
        dest="input",
        type=str,
        default=None,
        help="Input CSV path (default: RealData/negative_pts.csv or RealData/India_Landslides.csv)",
    )
    parser.add_argument(
        "--output", "-o", "--output-file",
        dest="output",
        type=str,
        default=None,
        help="Output CSV path (default: <input_stem>_with_features.csv in the same directory as input)",
    )
    parser.add_argument(
        "--label", "-l", "--output-label", "--output_label",
        dest="label",
        type=parse_label,
        default=None,
        help="Output label value to assign (e.g., 0 for negative points, 1 for positive landslides)",
    )
    parser.add_argument(
        "--batch-size", "-b",
        type=int,
        default=2500,
        help="GEE batch size (default: 2500)",
    )
    args = parser.parse_args()

    raw_input = args.csv_file or args.input
    if raw_input is None:
        default_candidate = SCRIPT_DIR / "negative_pts.csv"
        if not default_candidate.exists():
            default_candidate = SCRIPT_DIR / "India_Landslides.csv"
        raw_input = str(default_candidate)

    input_path = Path(raw_input)
    if input_path.exists():
        input_file = input_path.resolve()
    elif (Path.cwd() / input_path).exists():
        input_file = (Path.cwd() / input_path).resolve()
    elif (SCRIPT_DIR / input_path).exists():
        input_file = (SCRIPT_DIR / input_path).resolve()
    elif (CONTAINER_DIR / input_path).exists():
        input_file = (CONTAINER_DIR / input_path).resolve()
    else:
        logger.error(
            f"Input file not found: {raw_input}\n"
            f"Searched paths:\n"
            f"  - {input_path.resolve()}\n"
            f"  - {(Path.cwd() / input_path).resolve()}\n"
            f"  - {(SCRIPT_DIR / input_path).resolve()}\n"
            f"  - {(CONTAINER_DIR / input_path).resolve()}"
        )
        sys.exit(1)

    if args.output:
        output_file = Path(args.output)
        if not output_file.is_absolute():
            output_file = (Path.cwd() / output_file).resolve()
        else:
            output_file = output_file.resolve()
    else:
        output_file = input_file.parent / f"{input_file.stem}_with_features.csv"

    checkpoint_file = input_file.parent / f".checkpoint_dynamic_{input_file.stem}.csv"

    # 1. Clean input
    df = load_and_clean_landslides(input_file)

    # Determine target label
    if args.label is not None:
        target_label = args.label
    elif "label" in df.columns:
        target_label = df["label"].values
    elif "Label" in df.columns:
        target_label = df["Label"].values
    elif any(kw in input_file.stem.lower() for kw in ["negative", "nega", "absence", "non_landslide"]):
        target_label = 0
    else:
        target_label = 1

    label_desc = (
        str(target_label)
        if isinstance(target_label, (int, float, str))
        else f"Extracted from input CSV ({len(df)} records)"
    )

    logger.info("=" * 65)
    logger.info("Historical Feature Extraction Pipeline")
    logger.info(f"Input file   : {input_file}")
    logger.info(f"Output file  : {output_file}")
    logger.info(f"Target Label : {label_desc}")
    logger.info(f"Batch Size   : {args.batch_size}")
    logger.info("=" * 65)

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
    dyn_df = sample_historical_gee_features(df, batch_size=args.batch_size, checkpoint_path=checkpoint_file)

    # ==========================================================================
    # Merge All Features
    # ==========================================================================
    logger.info("Merging all features into final training schema...")
    output = df[["Latitude", "Longitude", "Fetch_Timestamp"]].copy()

    # Static features merge aligned by grid_idx
    if "grid_idx" in static_df.columns:
        s_indexed = static_df.set_index("grid_idx")
        for col in s_indexed.columns:
            if col not in ["Latitude", "Longitude"]:
                output[col] = s_indexed[col].reindex(output.index).values
    else:
        for col in static_df.columns:
            if col not in ["Latitude", "Longitude"]:
                output[col] = static_df[col].values

    # Add external static features
    output["Distance_to_Road_m"] = road_distances.values
    output["Historical_Landslide_Count"] = landslide_counts.values

    # Add earthquake activity
    output["Earthquake_Activity"] = eq_activity.values

    # Add dynamic date features
    for col in dyn_df.columns:
        output[col] = dyn_df[col].reindex(output.index).values

    # Compute Soil Erosion Rate (RUSLE model)
    output["Soil_Erosion_Rate"] = compute_soil_erosion_rate(output).values

    # Ensure exact column order matching pipeline
    for col in OUTPUT_COLUMNS:
        if col not in output.columns:
            output[col] = 0.0
    output = output[OUTPUT_COLUMNS]

    # Add requested Label column
    output["Label"] = target_label

    # Save final CSV
    output.to_csv(output_file, index=False)
    if checkpoint_file.exists():
        try:
            checkpoint_file.unlink()
        except Exception:
            pass

    logger.info("=" * 65)
    logger.info(f"SUCCESS: Generated features for {len(output)} records with Label={label_desc}!")
    logger.info(f"Saved to: {output_file}")
    logger.info(f"Columns ({len(output.columns)}): {list(output.columns)}")
    logger.info("=" * 65)


if __name__ == "__main__":
    main()
