#!/usr/bin/env python3
"""
Landslide Risk Monitoring -- Data Pipeline
==========================================

Pulls live geospatial data from Google Earth Engine and USGS API,
producing a single CSV ready for ML model inference with lat/lon
columns for heatmap rendering.

Supports N rectangle geometries defined in config.yaml.  All regions
are sampled in a single combined GEE call for efficiency.

Usage
-----
    python pipeline.py                  # Run once (smart refresh)
    python pipeline.py --fresh          # Force full refresh of all tiers
    python pipeline.py --daemon         # Run as daemon at IST 4-hour windows
    python pipeline.py --dry-run        # Show config & grid info, no GEE calls

Configuration: config.yaml
"""

import argparse
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import ee
import pandas as pd
import yaml

from earthquake_fetcher import compute_earthquake_activity
from gee_fetcher import (
    fetch_periodic_features,
    fetch_realtime_features,
    fetch_static_features,
)
from grid_generator import (
    compute_combined_bbox,
    generate_multi_grid,
    load_grid,
    save_grid,
)
from state_manager import StateManager

# ==============================================================================
# Constants
# ==============================================================================

IST = ZoneInfo("Asia/Kolkata")

# Output column order -- matches the ML model's expected schema.
# Latitude, Longitude, Region, Fetch_Timestamp are metadata (not fed to model).
OUTPUT_COLUMNS = [
    "Latitude",
    "Longitude",
    "Fetch_Timestamp",
    "Rainfall_mm",
    "Slope_Angle",
    "Soil_Saturation",
    "Vegetation_Cover",
    "Rainfall_3Day",
    "Aspect",
    "Elevation_m",
    "NDVI_Index",
    "Land_Use_Urban",
    "Land_Use_Forest",
    "Land_Use_Agriculture",
    "Earthquake_Activity",
    "Clay_Content",
    "Sand_Content",
    "Silt_Content",
    "Soil_Moisture_Content",
]

logger = logging.getLogger("pipeline")


# ==============================================================================
# Setup
# ==============================================================================


def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def load_config(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        logger.error(f"Config file not found: {path.resolve()}")
        sys.exit(1)
    with open(path, "r") as f:
        return yaml.safe_load(f)


def initialize_gee(gee_config: dict):
    """Authenticate and initialise the Earth Engine API."""
    project_id = gee_config["project_id"]
    cred_path = gee_config.get("credentials_path")

    try:
        if cred_path:
            credentials = ee.ServiceAccountCredentials("", cred_path)
            ee.Initialize(credentials=credentials, project=project_id)
            logger.info(f"GEE initialised (service account, project={project_id})")
        else:
            ee.Initialize(project=project_id)
            logger.info(f"GEE initialised (default credentials, project={project_id})")
    except Exception as exc:
        logger.error(
            f"GEE initialisation failed: {exc}\n"
            "  -> Run `earthengine authenticate` or check your config.yaml gee section."
        )
        sys.exit(1)


# ==============================================================================
# Core pipeline
# ==============================================================================


def run_pipeline(config: dict, *, fresh: bool = False) -> pd.DataFrame:
    """
    Execute a single pipeline cycle across all configured regions.

    Parameters
    ----------
    config : dict
        Parsed config.yaml contents.
    fresh : bool
        If True, ignore all caches and fetch everything from scratch.

    Returns
    -------
    pd.DataFrame -- the final merged output (also written to CSV).
    """
    regions = config["regions"]
    schedule_cfg = config["schedule"]
    eq_cfg = config["earthquake"]
    out_dir = Path(config["output"]["directory"])
    out_dir.mkdir(parents=True, exist_ok=True)

    region_names = [r.get("name", f"Region {i+1}") for i, r in enumerate(regions)]

    logger.info("=" * 65)
    logger.info(f"Pipeline run  |  regions = {len(regions)} ({', '.join(region_names)})")
    logger.info(f"              |  fresh = {fresh}")
    logger.info(f"              |  time  = {datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S IST')}")
    logger.info("=" * 65)

    # -- State management --------------------------------------------------
    state = StateManager(str(out_dir / "state.json"))
    regions_changed = state.have_regions_changed(regions)

    if regions_changed:
        logger.info("Region config change detected -- flushing all caches")
        state.reset_all()
        state.update_regions_hash(regions)

    # -- Grid generation / loading -----------------------------------------
    grid_file = out_dir / "grid_points.csv"
    if regions_changed or fresh or not grid_file.exists():
        logger.info(f"Generating combined grid for {len(regions)} region(s) ...")
        grid_df = generate_multi_grid(regions)
        save_grid(grid_df, str(grid_file))
        logger.info(f"Grid created: {len(grid_df)} total sample points (after overlap dedup)")
    else:
        grid_df = load_grid(str(grid_file))
        logger.info(f"Grid loaded from cache: {len(grid_df)} points")

    # -- Initialise GEE ----------------------------------------------------
    initialize_gee(config["gee"])

    # -- Tier 1: Static ----------------------------------------------------
    static_cache = out_dir / "static_cache.csv"
    if fresh or state.needs_static_fetch(regions):
        static_df = fetch_static_features(grid_df)
        static_df.to_csv(static_cache, index=False)
        state.update_timestamp("static")
        logger.info("Tier 1 (Static): fetched and cached")
    else:
        static_df = pd.read_csv(static_cache)
        logger.info("Tier 1 (Static): loaded from cache")

    # -- Tier 2: Periodic --------------------------------------------------
    periodic_cache = out_dir / "periodic_cache.csv"
    refresh_days = schedule_cfg["periodic_refresh_days"]
    if fresh or state.needs_periodic_fetch(regions, refresh_days):
        periodic_df = fetch_periodic_features(grid_df)
        periodic_df.to_csv(periodic_cache, index=False)
        state.update_timestamp("periodic")
        logger.info("Tier 2 (Periodic): fetched and cached")
    else:
        periodic_df = pd.read_csv(periodic_cache)
        logger.info(f"Tier 2 (Periodic): loaded from cache (<{refresh_days}d old)")

    # -- Tier 3: Realtime --------------------------------------------------
    realtime_df = fetch_realtime_features(grid_df)
    state.update_timestamp("realtime")
    logger.info("Tier 3 (Realtime): fetched")

    # -- Tier 4: Earthquake ------------------------------------------------
    # Use the bounding box that encloses ALL regions for the USGS query.
    combined_bbox = compute_combined_bbox(regions)
    eq_activity = compute_earthquake_activity(
        grid_df,
        combined_bbox,
        lookback_days=eq_cfg["lookback_days"],
        min_magnitude=eq_cfg["min_magnitude"],
        max_radius_km=eq_cfg["max_radius_km"],
    )
    state.update_timestamp("earthquake")
    logger.info("Tier 4 (Earthquake): fetched")

    # ======================================================================
    # Merge all tiers
    # ======================================================================
    logger.info("Merging tiers ...")

    output = grid_df.copy()
    output.index = range(len(output))  # ensure 0-based contiguous index
    output["Fetch_Timestamp"] = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")

    # Merge each tier on grid_idx.  Drop the duplicate Latitude/Longitude
    # columns that come back from sampleRegions.
    for tier_df, tier_label in [
        (static_df, "static"),
        (periodic_df, "periodic"),
        (realtime_df, "realtime"),
    ]:
        if tier_df.empty:
            logger.warning(f"  {tier_label} tier returned empty -- skipping merge")
            continue

        # Keep only feature columns + grid_idx for the join
        drop_cols = {"Latitude", "Longitude"} & set(tier_df.columns)
        join_df = tier_df.drop(columns=list(drop_cols), errors="ignore")

        if "grid_idx" in join_df.columns:
            output = output.merge(join_df, left_index=True, right_on="grid_idx", how="left")
            if "grid_idx" in output.columns:
                output = output.drop(columns=["grid_idx"])
            output = output.reset_index(drop=True)
        else:
            # Fallback: positional join (same row count & order)
            for col in join_df.columns:
                output[col] = join_df[col].values

    # Add earthquake activity (already aligned by index)
    output["Earthquake_Activity"] = eq_activity.values

    # -- Reorder to match ML schema (guarantee all columns present) --------
    for col in OUTPUT_COLUMNS:
        if col not in output.columns:
            logger.warning(f"Column '{col}' was missing from output tiers -- filling with 0.0 default")
            output[col] = 0.0
    output = output[OUTPUT_COLUMNS]

    # -- Write CSV ---------------------------------------------------------
    out_file = out_dir / config["output"]["filename"]
    output.to_csv(out_file, index=False)
    state.save()

    logger.info(f"Output saved: {out_file.resolve()}")
    logger.info(f"  Rows   : {len(output)}")
    logger.info(f"  Columns: {len(output.columns)}")
    logger.info(f"  Schema : {list(output.columns)}")

    # Quick sanity stats
    nan_counts = output.isna().sum()
    if nan_counts.any():
        logger.warning(f"NaN counts:\n{nan_counts[nan_counts > 0]}")

    return output


# ==============================================================================
# Daemon / scheduler
# ==============================================================================


def get_next_ist_window(interval_hours: int = 4) -> datetime:
    """
    Return the next IST-aligned window.

    With interval_hours=4, windows are: 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 IST.
    """
    now = datetime.now(IST)
    current_hour = now.hour
    next_hour = ((current_hour // interval_hours) + 1) * interval_hours

    if next_hour >= 24:
        base = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return base + timedelta(days=1)
    else:
        return now.replace(hour=next_hour, minute=0, second=0, microsecond=0)


def daemon_loop(config: dict):
    """
    Run the pipeline in daemon mode.

    Executes immediately, then sleeps until the next IST 4-hour window.
    """
    interval = config["schedule"]["interval_hours"]
    logger.info(f"Daemon mode started -- IST {interval}h windows")
    logger.info("Running initial fetch ...")

    try:
        run_pipeline(config)
    except Exception:
        logger.exception("Initial pipeline run failed")

    while True:
        next_win = get_next_ist_window(interval)
        sleep_sec = max(0, (next_win - datetime.now(IST)).total_seconds())

        logger.info(
            f"Next run: {next_win.strftime('%Y-%m-%d %H:%M IST')} "
            f"(sleeping {sleep_sec:.0f}s / {sleep_sec / 60:.1f}min)"
        )
        time.sleep(sleep_sec)

        try:
            run_pipeline(config)
        except Exception:
            logger.exception("Pipeline run failed -- will retry at next window")


# ==============================================================================
# CLI
# ==============================================================================


def main():
    parser = argparse.ArgumentParser(
        description="Landslide Risk Monitoring -- GEE Data Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python pipeline.py                 # smart refresh\n"
            "  python pipeline.py --fresh         # force full fetch\n"
            "  python pipeline.py --daemon        # IST 4h daemon\n"
            "  python pipeline.py --dry-run       # preview only\n"
        ),
    )
    parser.add_argument(
        "--config", default="config.yaml", help="Path to configuration file (default: config.yaml)"
    )
    parser.add_argument(
        "--fresh", action="store_true", help="Force-refresh all tiers, ignoring cache"
    )
    parser.add_argument(
        "--daemon", action="store_true", help="Run as daemon, triggering at IST 4h windows"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Show configuration and grid info without fetching"
    )
    args = parser.parse_args()

    setup_logging()
    config = load_config(args.config)

    # -- Dry run: just show what WOULD happen ------------------------------
    if args.dry_run:
        regions = config["regions"]
        grid_df = generate_multi_grid(regions)

        # Compute per-region counts from individual grids
        from grid_generator import generate_grid
        per_region = []
        for region in regions:
            g = generate_grid(region["bbox"], region["grid_resolution_km"])
            per_region.append(g)

        raw_total = sum(len(g) for g in per_region)
        deduped_total = len(grid_df)

        print()
        print("=" * 62)
        print("          Landslide Risk Pipeline -- Dry Run")
        print("=" * 62)
        print(f"  Regions       : {len(regions)}")
        print(f"  Total points  : {deduped_total}", end="")
        if raw_total != deduped_total:
            print(f" ({raw_total - deduped_total} overlap duplicates removed)")
        else:
            print()
        print(f"  GEE project   : {config['gee']['project_id']}")
        print(f"  Output        : {config['output']['directory']}/{config['output']['filename']}")
        print(f"  Schedule      : every {config['schedule']['interval_hours']}h IST")
        print("-" * 62)

        for i, (region, g) in enumerate(zip(regions, per_region)):
            name = region.get("name", f"Region {i+1}")
            bbox = region["bbox"]
            res = region["grid_resolution_km"]
            print(f"  [{i+1}] {name}")
            print(f"      Bbox       : ({bbox['min_lat']}, {bbox['min_lon']}) to ({bbox['max_lat']}, {bbox['max_lon']})")
            print(f"      Resolution : {res} km")
            print(f"      Points     : {len(g)}")
            print(f"      Lat range  : {g['Latitude'].min():.4f} -- {g['Latitude'].max():.4f}")
            print(f"      Lon range  : {g['Longitude'].min():.4f} -- {g['Longitude'].max():.4f}")

        print("=" * 62)
        print()
        return

    # -- Daemon or single run ----------------------------------------------
    if args.daemon:
        daemon_loop(config)
    else:
        run_pipeline(config, fresh=args.fresh)


if __name__ == "__main__":
    main()
