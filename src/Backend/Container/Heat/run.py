#!/usr/bin/env python3
"""
Landslide Risk Monitoring -- Unified Orchestrator
==================================================

Single entry-point that chains:
  1. Data Pipeline   – pulls live geospatial data (LiveData/pipeline.py)
  2. ML Prediction   – runs XGBoost model on the fetched data
  3. HTTP Push        – POSTs predictions to the remote server

Usage
-----
    python run.py                # Run once: fetch → predict → push
    python run.py --daemon       # Daemon mode: repeat on 4h IST schedule
    python run.py --fresh        # Force full pipeline refresh
    python run.py --dry-run      # Preview config & grid only (no GEE calls)
"""

import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import joblib
import numpy as np
import pandas as pd
import requests
import yaml

# ==============================================================================
# Path setup -- allow importing LiveData modules
# ==============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent          # Heat/
CONTAINER_DIR = SCRIPT_DIR.parent                     # Container/
LIVEDATA_DIR = CONTAINER_DIR / "LiveData"
ML_MODEL_DIR = SCRIPT_DIR / "ML-model"

sys.path.insert(0, str(LIVEDATA_DIR))

IST = ZoneInfo("Asia/Kolkata")
logger = logging.getLogger("run")

# ==============================================================================
# Configuration
# ==============================================================================


def load_config(config_path: str | None = None) -> dict:
    """Load config.yaml from Container/ (or an explicit path)."""
    if config_path:
        path = Path(config_path)
    else:
        path = CONTAINER_DIR / "config.yaml"

    if not path.exists():
        logger.error(f"Config file not found: {path.resolve()}")
        sys.exit(1)

    with open(path, "r") as f:
        config = yaml.safe_load(f)

    # Resolve relative output directory against CONTAINER_DIR
    out_dir = Path(config["output"]["directory"])
    if not out_dir.is_absolute():
        config["output"]["directory"] = str((CONTAINER_DIR / out_dir).resolve())

    return config


# ==============================================================================
# Phase 1: Data Pipeline
# ==============================================================================


def run_data_pipeline(config: dict, *, fresh: bool = False) -> pd.DataFrame:
    """Execute the LiveData pipeline and return the output DataFrame."""
    from pipeline import run_pipeline, setup_logging
    setup_logging()
    return run_pipeline(config, fresh=fresh)


# ==============================================================================
# Phase 2: ML Prediction
# ==============================================================================

# Load model once at module level for reuse across daemon cycles
MODEL_PATH = ML_MODEL_DIR / "landslide_model.pkl"


def load_model():
    """Load the pre-trained XGBoost model from disk."""
    if not MODEL_PATH.exists():
        logger.error(f"Model file not found: {MODEL_PATH}")
        sys.exit(1)
    model = joblib.load(MODEL_PATH)
    logger.info(f"ML model loaded: {MODEL_PATH.name}")
    return model


def run_prediction(model, output_csv: Path) -> pd.DataFrame:
    """
    Run the ML model on the pipeline output.

    Returns a DataFrame with Latitude, Longitude, and Risk_Rating (clamped 0-1).
    Also saves the full prediction output to Heat/ML-model/predicted_risk_output.csv.
    """
    df = pd.read_csv(output_csv)
    logger.info(f"Prediction input: {len(df)} rows from {output_csv.name}")

    # Drop metadata columns -- the model was trained without them
    feature_df = df.drop(columns=["Latitude", "Longitude", "Fetch_Timestamp"], errors="ignore")

    # Reorder columns to match the model's training feature order
    expected_order = model.get_booster().feature_names
    feature_df = feature_df[expected_order]
    logger.info(f"Features reordered to match model ({len(expected_order)} features)")

    # Predict probabilities (class 1 = landslide risk)
    risk_ratings = model.predict_proba(feature_df)[:, 1].round(4)

    df["Risk_Rating"] = risk_ratings

    # Save prediction output (only key columns)
    pred_output = ML_MODEL_DIR / "predicted_risk_output.csv"
    df[["Latitude", "Longitude", "Risk_Rating"]].to_csv(pred_output, index=False)
    logger.info(f"Predictions saved: {pred_output.name} ({len(df)} rows)")

    return df


# ==============================================================================
# Phase 3: Build CSV payload & HTTP Push
# ==============================================================================

PREDICTIONS_CSV = CONTAINER_DIR / "data" / "latest_predictions.csv"


def build_predictions_csv(prediction_df: pd.DataFrame, grid_csv: Path) -> pd.DataFrame:
    """
    Build the predictions CSV by merging grid_points.csv with Risk_Rating.

    Returns a DataFrame with columns: Latitude, Longitude, Risk_Rating.
    """
    grid_df = pd.read_csv(grid_csv)

    # Merge grid points with risk ratings (aligned by row index)
    merged = grid_df.copy()
    merged["Risk_Rating"] = prediction_df["Risk_Rating"].values

    return merged


def save_predictions_locally(predictions: pd.DataFrame):
    """Save the predictions CSV to disk (overwritten each cycle)."""
    PREDICTIONS_CSV.parent.mkdir(parents=True, exist_ok=True)
    predictions.to_csv(PREDICTIONS_CSV, index=False)
    logger.info(f"Predictions CSV saved locally: {PREDICTIONS_CSV.name} ({len(predictions)} rows)")


def push_to_server(predictions: pd.DataFrame, server_config: dict) -> bool:
    """
    POST the predictions to the remote server as a multipart form upload.

    Form fields:
        key   -- API key / identifier (from config)
        time  -- ISO timestamp when predictions were generated
    File:
        data  -- CSV file with Latitude, Longitude, Risk_Rating

    Returns True on success, False on failure.
    """
    url = server_config["url"]
    api_key = server_config.get("api_key", "")
    finish_time = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")

    # Convert DataFrame to CSV string for upload
    csv_content = predictions.to_csv(index=False)

    form_data = {
        "key": (None, api_key),
        "time": (None, finish_time),
    }
    files = {
        "data": ("predictions.csv", csv_content, "text/csv"),
    }

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"POST attempt {attempt}/{max_retries} → {url}")
            resp = requests.post(url, data=form_data, files=files, headers=headers, timeout=60)
            resp.raise_for_status()
            logger.info(f"Server responded: {resp.status_code} ({len(resp.content)} bytes)")
            return True
        except requests.exceptions.RequestException as exc:
            logger.warning(f"Attempt {attempt} failed: {exc}")
            if attempt < max_retries:
                backoff = 2 ** attempt
                logger.info(f"Retrying in {backoff}s ...")
                time.sleep(backoff)

    logger.error(f"All {max_retries} POST attempts failed — CSV saved locally at {PREDICTIONS_CSV}")
    return False


# ==============================================================================
# Orchestrator
# ==============================================================================


def run_cycle(config: dict, model, *, fresh: bool = False):
    """Execute one full cycle: pipeline → predict → push."""
    logger.info("=" * 65)
    logger.info("Starting cycle: Pipeline → Predict → Push")
    logger.info("=" * 65)

    # Phase 1: Data pipeline
    run_data_pipeline(config, fresh=fresh)

    # Resolve paths
    out_dir = Path(config["output"]["directory"])
    output_csv = out_dir / config["output"]["filename"]
    grid_csv = out_dir / "grid_points.csv"

    if not output_csv.exists():
        logger.error(f"Pipeline output not found: {output_csv}")
        return

    # Phase 2: ML prediction
    prediction_df = run_prediction(model, output_csv)

    # Phase 3: Build CSV, save locally, then push
    predictions = build_predictions_csv(prediction_df, grid_csv)
    save_predictions_locally(predictions)
    push_to_server(predictions, config["server"])

    logger.info("Cycle complete")
    logger.info("=" * 65)


# ==============================================================================
# Daemon loop
# ==============================================================================


def get_next_ist_window(interval_hours: int = 4) -> datetime:
    """Return the next IST-aligned window."""
    now = datetime.now(IST)
    current_hour = now.hour
    next_hour = ((current_hour // interval_hours) + 1) * interval_hours

    if next_hour >= 24:
        base = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return base + timedelta(days=1)
    else:
        return now.replace(hour=next_hour, minute=0, second=0, microsecond=0)


def daemon_loop(config: dict, model):
    """Run cycles on the IST 4h schedule."""
    interval = config["schedule"]["interval_hours"]
    logger.info(f"Daemon mode started — IST {interval}h windows")
    logger.info("Running initial cycle ...")

    try:
        run_cycle(config, model)
    except Exception:
        logger.exception("Initial cycle failed")

    while True:
        next_win = get_next_ist_window(interval)
        sleep_sec = max(0, (next_win - datetime.now(IST)).total_seconds())

        logger.info(
            f"Next run: {next_win.strftime('%Y-%m-%d %H:%M IST')} "
            f"(sleeping {sleep_sec:.0f}s / {sleep_sec / 60:.1f}min)"
        )
        time.sleep(sleep_sec)

        try:
            run_cycle(config, model)
        except Exception:
            logger.exception("Cycle failed — will retry at next window")


# ==============================================================================
# CLI
# ==============================================================================


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Landslide Risk Monitoring — Unified Orchestrator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python run.py                # single cycle\n"
            "  python run.py --daemon       # IST 4h daemon\n"
            "  python run.py --fresh        # force full refresh\n"
            "  python run.py --dry-run      # preview only\n"
        ),
    )
    parser.add_argument(
        "--config", default=None,
        help="Path to config.yaml (default: Container/config.yaml)",
    )
    parser.add_argument(
        "--fresh", action="store_true",
        help="Force-refresh all pipeline tiers, ignoring cache",
    )
    parser.add_argument(
        "--daemon", action="store_true",
        help="Run as daemon, triggering at IST 4h windows",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show configuration and grid info without fetching",
    )
    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    config = load_config(args.config)

    # Dry run -- delegate to the pipeline's own dry-run
    if args.dry_run:
        sys.argv = ["pipeline.py", "--dry-run"]
        if args.config:
            sys.argv += ["--config", args.config]
        from pipeline import main as pipeline_main
        pipeline_main()
        return

    # Load ML model once
    model = load_model()

    # Daemon or single cycle
    if args.daemon:
        daemon_loop(config, model)
    else:
        run_cycle(config, model, fresh=args.fresh)


if __name__ == "__main__":
    main()
