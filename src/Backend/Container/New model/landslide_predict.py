"""
landslide_predict.py
--------------------
Shared feature code + inference.

Outputs for every row:
    landslide_score      continuous probability in [0, 1] (calibrated)
    risk_level           Low / Moderate / High / Critical
    landslide_predicted  1 if score >= tuned threshold
    hours_to_landslide   median estimate (only for flagged rows)
    hours_low/hours_high 10th / 90th percentile range (learned model only)
    ttf_horizon          0-4h / 4-12h / 12-24h / 24-72h bucket
    ttf_method           "learned" or "heuristic"

Usage from your 4-hourly daemon:
    from landslide_predict import load_artifact, predict
    art = load_artifact()
    result = predict(df_live, art)

CLI:
    python landslide_predict.py live_features.csv predictions.csv
"""

import os
import sys

import joblib
import numpy as np
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ARTIFACT = os.path.join(BASE_DIR, "landslide_model_v2.pkl")

# Columns kept only for passthrough / grouping, never used as features
ID_COLUMNS = ["Latitude", "Longitude", "Fetch_Timestamp"]

RISK_BINS = [0.0, 0.25, 0.50, 0.75, 1.0001]
RISK_LABELS = ["Low", "Moderate", "High", "Critical"]

TTF_BINS = [0, 4, 12, 24, np.inf]
TTF_LABELS = ["0-4h", "4-12h", "12-24h", "24h+"]


# ----------------------------------------------------------------------
# Feature engineering (used by BOTH training and inference)
# ----------------------------------------------------------------------
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    if {"Rainfall_mm", "Slope_Angle"}.issubset(df.columns):
        df["Rainfall_Slope_Interaction"] = df["Rainfall_mm"] * df["Slope_Angle"]

    if {"Soil_Saturation", "Slope_Angle"}.issubset(df.columns):
        df["Saturation_Slope_Interaction"] = (
            df["Soil_Saturation"] * df["Slope_Angle"]
        )

    return df.replace([np.inf, -np.inf], np.nan)


def _logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p)).reshape(-1, 1)


# ----------------------------------------------------------------------
# Time-to-failure fallback (used only if no learned TTF model exists)
# ----------------------------------------------------------------------
def heuristic_hours(score, X, art):
    """
    NOT learned from data. A monotone rule: higher score and more
    rain / saturation => sooner. Treat as a rough urgency indicator
    until you have real time-to-failure labels.
    """
    min_h, max_h = 1.0, float(art["ttf_max_hours"])

    urgency = np.zeros(len(X))
    parts = 0
    for col, ref in art["heuristic_refs"].items():
        if col in X.columns and ref and ref > 0:
            urgency += np.clip(X[col].fillna(0).values / ref, 0, 1)
            parts += 1
    urgency = urgency / parts if parts else urgency

    base = (1 - np.clip(score, 0, 1)) ** 1.5
    hours = min_h + (max_h - min_h) * base * (1 - 0.5 * urgency)
    return hours


# ----------------------------------------------------------------------
# Inference
# ----------------------------------------------------------------------
def load_artifact(path: str = DEFAULT_ARTIFACT) -> dict:
    return joblib.load(path)


def predict(df: pd.DataFrame, art: dict, only_flagged: bool = True) -> pd.DataFrame:
    keep_ids = [c for c in ["Latitude", "Longitude"] if c in df.columns]
    out = df[keep_ids].copy().reset_index(drop=True)

    X = build_features(df.drop(columns=[c for c in ID_COLUMNS if c in df.columns]))
    X = X.reindex(columns=art["features"])  # missing cols -> NaN, order enforced
    X = X.reset_index(drop=True)

    # 1) continuous, calibrated score
    raw = art["clf"].predict_proba(X)[:, 1]
    score = art["calibrator"].predict_proba(_logit(raw))[:, 1]

    out["landslide_score"] = np.round(score, 4)
    out["Risk_Rating"] = out["landslide_score"]
    out["risk_level"] = pd.cut(
        score, bins=RISK_BINS, labels=RISK_LABELS, right=False
    ).astype(str)
    flagged = score >= art["threshold"]
    out["landslide_predicted"] = flagged.astype(int)

    # 2) hours to landslide
    hours = np.full(len(X), np.nan)
    low = np.full(len(X), np.nan)
    high = np.full(len(X), np.nan)

    if art.get("ttf_model") is not None:
        q = np.sort(art["ttf_model"].predict(X), axis=1)  # [p10, p50, p90]
        q = np.clip(np.expm1(q), 0.5, art["ttf_max_hours"])
        low, hours, high = q[:, 0], q[:, 1], q[:, 2]
        method = "learned"
    else:
        hours = heuristic_hours(score, X, art)
        method = "heuristic"

    if only_flagged:
        hours = np.where(flagged, hours, np.nan)
        low = np.where(flagged, low, np.nan)
        high = np.where(flagged, high, np.nan)

    out["hours_to_landslide"] = np.round(hours, 1)
    out["hours_low"] = np.round(low, 1)
    out["hours_high"] = np.round(high, 1)
    out["ttf_horizon"] = pd.cut(
        pd.Series(hours), bins=TTF_BINS, labels=TTF_LABELS
    ).astype(object)
    out["ttf_method"] = method
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python landslide_predict.py input.csv output.csv")
        sys.exit(1)

    art = load_artifact()
    data = pd.read_csv(sys.argv[1])
    result = predict(data, art)
    result.to_csv(sys.argv[2], index=False)
    print(result.head())
    print(f"\nSaved {len(result)} predictions to {sys.argv[2]}")