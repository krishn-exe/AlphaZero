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
import os
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
NEW_MODEL_DIR = CONTAINER_DIR / "New model"

sys.path.insert(0, str(LIVEDATA_DIR))
sys.path.insert(0, str(NEW_MODEL_DIR))
sys.path.insert(0, str(ML_MODEL_DIR))
from time_utils import get_current_ist_time

IST = ZoneInfo("Asia/Kolkata")
logger = logging.getLogger("run")

# ==============================================================================
# Configuration & Environment
# ==============================================================================


def init_env():
    """Load environment variables from Container/.env."""
    env_file = CONTAINER_DIR / ".env"
    if not env_file.exists():
        return
    try:
        from dotenv import load_dotenv
        load_dotenv(env_file)
    except Exception:
        pass

    # Robust fallback line parser if dotenv failed or missing
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k and k not in os.environ:
                        os.environ[k] = v
    except Exception as exc:
        logger.warning(f"Failed to parse .env file: {exc}")


def load_config(config_path: str | None = None) -> dict:
    """Load config.yaml from Container/ (or explicit path) and merge environment variables."""
    init_env()
    if config_path:
        path = Path(config_path)
    else:
        path = CONTAINER_DIR / "config.yaml"

    if not path.exists():
        logger.error(f"Config file not found: {path.resolve()}")
        sys.exit(1)

    with open(path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # Resolve relative output directory against CONTAINER_DIR
    out_dir = Path(config["output"]["directory"])
    if not out_dir.is_absolute():
        config["output"]["directory"] = str((CONTAINER_DIR / out_dir).resolve())

    # Environment variables override/populate server configuration
    server_cfg = config.setdefault("server", {})

    env_api_key = os.environ.get("AIML_API_KEY") or os.environ.get("API_KEY")
    if env_api_key:
        server_cfg["api_key"] = env_api_key

    env_api_url = os.environ.get("API_URL")
    if env_api_url:
        server_cfg["url"] = env_api_url
    elif not server_cfg.get("url"):
        server_cfg["url"] = "https://krishn.tech/api/map/national"

    env_bypass = os.environ.get("BYPASS_TIME_WINDOW", "").strip().lower()
    if env_bypass in ("true", "1", "yes"):
        server_cfg["bypass_time"] = True
    elif "bypass_time" not in server_cfg:
        server_cfg["bypass_time"] = False

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

# Active model is the new risk regressor located in the "New model" folder
ACTIVE_MODEL_PATH = NEW_MODEL_DIR / "landslide_risk_regressor.pkl"
FALLBACK_MODEL_PATH = ML_MODEL_DIR / "landslide_risk_regressor.pkl"
MODEL_PATH = ACTIVE_MODEL_PATH if ACTIVE_MODEL_PATH.exists() else FALLBACK_MODEL_PATH


def load_model(model_path: Path | None = None):
    """Load the pre-trained ML model artifact from disk."""
    target_path = Path(model_path) if model_path else MODEL_PATH
    if not target_path.exists():
        logger.error(f"Model file not found: {target_path}")
        sys.exit(1)
    artifact = joblib.load(target_path)
    if isinstance(artifact, dict) and "model" in artifact:
        model_obj = artifact["model"]
        features = artifact.get("features", [])
        logger.info(
            f"Active risk regressor loaded from {target_path} "
            f"({len(features)} features, {type(model_obj).__name__})"
        )
    elif isinstance(artifact, dict) and "clf" in artifact:
        logger.info(
            f"Calibrated classifier artifact loaded: {target_path.name} "
            f"({len(artifact.get('features', []))} features)"
        )
    else:
        logger.info(f"Legacy model loaded: {target_path.name}")
    return artifact


def run_prediction(model, output_csv: Path) -> pd.DataFrame:
    """
    Run the ML model on the pipeline output.

    Returns a DataFrame with Latitude, Longitude, and Risk_Rating (clamped 0-1).
    Also saves the prediction output to Heat/ML-model/predicted_risk_output.csv.
    """
    df = pd.read_csv(output_csv)
    logger.info(f"Prediction input: {len(df)} rows from {output_csv.name}")

    if isinstance(model, dict) and "model" in model:
        # Active Model: XGBoost Regressor directly predicting continuous values [0, 1]
        # Feature interactions
        if "Rainfall_mm" in df.columns and "Slope_Angle" in df.columns:
            df["Rainfall_Slope_Interaction"] = df["Rainfall_mm"] * df["Slope_Angle"]
        if "Soil_Saturation" in df.columns and "Slope_Angle" in df.columns:
            df["Saturation_Slope_Interaction"] = df["Soil_Saturation"] * df["Slope_Angle"]

        features = model["features"]
        X_new = df[features].replace([np.inf, -np.inf], np.nan)

        # Regressor with reg:logistic directly gives probability output in (0, 1)
        raw_prob = model["model"].predict(X_new)
        # Uniformizer maps to calibrated percentile risk rating in [0, 1]
        risk_rating = model["uniformizer"].transform(raw_prob.reshape(-1, 1)).ravel()

        risk_ratings = np.round(np.clip(risk_rating, 0.0, 1.0), 4)
        raw_scores = np.round(np.clip(raw_prob, 0.0, 1.0), 4)

        df["Risk_Rating"] = risk_ratings
        df["Raw_Score"] = raw_scores

        logger.info(
            f"Regressor inference complete: {len(df)} rows | "
            f"Risk_Rating mean={risk_ratings.mean():.4f}, min={risk_ratings.min():.4f}, max={risk_ratings.max():.4f} | "
            f"Raw_Score mean={raw_scores.mean():.4f}"
        )
    elif isinstance(model, dict) and "clf" in model:
        from landslide_predict import predict as v2_predict
        res = v2_predict(df, model)
        risk_ratings = res["landslide_score"].values
        df["Risk_Rating"] = risk_ratings
    else:
        # Legacy fallback: raw XGBoost classifier
        feature_df = df.drop(columns=["Latitude", "Longitude", "Fetch_Timestamp"], errors="ignore")
        expected_order = model.get_booster().feature_names
        feature_df = feature_df[expected_order]
        logger.info(f"Features reordered to match legacy model ({len(expected_order)} features)")
        risk_ratings = model.predict_proba(feature_df)[:, 1].round(4)
        df["Risk_Rating"] = risk_ratings

    # Save prediction output (standard schema: Latitude, Longitude, Risk_Rating)
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

    Endpoint: POST /api/map/national (or /api/map/predictions, /api/predictions)
    Hosted at: https://krishn.tech

    Form fields:
        key   -- API key (loaded from AIML_API_KEY in .env)
        time  -- ISO timestamp when predictions were generated
    Files:
        file  -- CSV file with Latitude, Longitude, Risk_Rating
        data  -- (alias for file field)

    Authentication methods (sent concurrently for full compatibility):
        - Form field: key
        - Header: x-api-key
        - Header: Authorization: Bearer <key>

    Returns True on success, False on failure.
    """
    url = server_config.get("url", "https://krishn.tech/api/map/national")
    api_key = server_config.get("api_key", "").strip()
    bypass_time = server_config.get("bypass_time", False)

    if bypass_time and "bypass_time=true" not in url:
        delim = "&" if "?" in url else "?"
        url = f"{url}{delim}bypass_time=true"

    finish_time = datetime.now(IST).strftime("%Y-%m-%d %H:%M:%S IST")

    # Convert DataFrame to CSV string for upload
    csv_content = predictions.to_csv(index=False)

    form_data = {
        "key": (None, api_key),
        "time": (None, finish_time),
    }
    # Send under both 'file' and 'data' aliases for full backend compatibility
    files = {
        "file": ("predictions.csv", csv_content, "text/csv"),
        "data": ("predictions.csv", csv_content, "text/csv"),
    }

    headers = {}
    if api_key:
        headers["x-api-key"] = api_key
        headers["Authorization"] = f"Bearer {api_key}"

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"POST attempt {attempt}/{max_retries} → {url}")
            resp = requests.post(url, data=form_data, files=files, headers=headers, timeout=60)
            if resp.status_code in (200, 201):
                logger.info(f"Server upload successful: {resp.status_code} ({len(resp.content)} bytes) - {resp.text[:300]}")
                return True
            else:
                logger.warning(f"Server returned status {resp.status_code}: {resp.text}")
                resp.raise_for_status()
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


def get_next_ist_window(interval_hours: int = 4, reference_time: datetime = None) -> datetime:
    """Return the next IST-aligned window based on verified IST time."""
    now = reference_time or get_current_ist_time()
    current_hour = now.hour
    next_hour = ((current_hour // interval_hours) + 1) * interval_hours

    if next_hour >= 24:
        base = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return base + timedelta(days=1)
    else:
        return now.replace(hour=next_hour, minute=0, second=0, microsecond=0)


def is_on_scheduled_window(interval_hours: int = 4, tolerance_minutes: int = 2, reference_time: datetime = None) -> bool:
    """Check if verified IST time is right at a scheduled interval window (e.g. 00:00, 04:00, etc.)."""
    now = reference_time or get_current_ist_time()
    return (now.hour % interval_hours == 0) and (now.minute < tolerance_minutes)


def daemon_loop(config: dict, model):
    """Run cycles on the IST 4h schedule."""
    interval = config["schedule"]["interval_hours"]
    logger.info(f"Daemon mode started — IST {interval}h windows")

    current_ist = get_current_ist_time()
    logger.info(f"Verified current IST time: {current_ist.strftime('%Y-%m-%d %H:%M:%S IST')}")

    if is_on_scheduled_window(interval, reference_time=current_ist):
        logger.info("Daemon started at scheduled window. Running initial cycle ...")
        try:
            run_cycle(config, model)
        except Exception:
            logger.exception("Initial cycle failed")
    else:
        logger.info("Daemon started outside scheduled window. Waiting until next scheduled window ...")

    while True:
        verified_ist = get_current_ist_time()
        next_win = get_next_ist_window(interval, reference_time=verified_ist)
        sleep_sec = max(0, (next_win - verified_ist).total_seconds())

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
    parser.add_argument(
        "--bypass-time", action="store_true",
        help="Append bypass_time=true to the API URL for testing outside IST schedule windows",
    )
    args = parser.parse_args()

    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    config = load_config(args.config)
    if args.bypass_time:
        config["server"]["bypass_time"] = True

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
