"""
predict.py
----------
Inference module for Landslide Risk Regressor (New model).
Loads landslide_risk_regressor.pkl, generates feature interactions,
and computes Risk_Rating in [0.0000, 1.0000].
"""

import os
import sys
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import QuantileTransformer

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BASE_DIR / "landslide_risk_regressor.pkl"

ID_COLUMNS = ["Latitude", "Longitude", "Fetch_Timestamp"]


def fit_uniformizer(raw_scores):
    """Learn the mapping raw score -> percentile (uniform on 0-1)."""
    qt = QuantileTransformer(
        n_quantiles=min(1000, len(raw_scores)),
        output_distribution="uniform",
        random_state=42,
    )
    qt.fit(np.asarray(raw_scores).reshape(-1, 1))
    return qt


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Generate interaction features matching training pipeline."""
    df = df.copy()
    if "Rainfall_mm" in df.columns and "Slope_Angle" in df.columns:
        df["Rainfall_Slope_Interaction"] = df["Rainfall_mm"] * df["Slope_Angle"]
    if "Soil_Saturation" in df.columns and "Slope_Angle" in df.columns:
        df["Saturation_Slope_Interaction"] = df["Soil_Saturation"] * df["Slope_Angle"]
    return df


def load_artifact(path: str | Path | None = None) -> dict:
    """Load the model artifact dictionary."""
    target_path = Path(path) if path else DEFAULT_MODEL_PATH
    if not target_path.exists():
        raise FileNotFoundError(f"Model artifact not found at {target_path}")
    return joblib.load(target_path)


def predict_risk(artifact: dict, df: pd.DataFrame, refit_on_new: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns (raw_probability, risk_rating) for input data.
    Raw score is the direct reg:logistic sigmoid output in (0, 1).
    Risk rating is the uniformized percentile in [0, 1].
    """
    df_feat = build_features(df)
    X_new = df_feat[artifact["features"]].replace([np.inf, -np.inf], np.nan)
    raw = artifact["model"].predict(X_new)

    uniformizer = fit_uniformizer(raw) if refit_on_new else artifact["uniformizer"]
    risk = uniformizer.transform(raw.reshape(-1, 1)).ravel()
    return raw, risk


def predict(df: pd.DataFrame, artifact: dict, refit_on_new: bool = False) -> pd.DataFrame:
    """
    Produce DataFrame with Latitude, Longitude, Risk_Rating, and Raw_Score.
    """
    raw, risk = predict_risk(artifact, df, refit_on_new=refit_on_new)
    
    out = pd.DataFrame()
    if "Latitude" in df.columns:
        out["Latitude"] = df["Latitude"].values
    if "Longitude" in df.columns:
        out["Longitude"] = df["Longitude"].values

    out["Risk_Rating"] = np.round(np.clip(risk, 0.0, 1.0), 4)
    out["Raw_Score"] = np.round(np.clip(raw, 0.0, 1.0), 4)
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python predict.py <input_csv> [output_csv]")
        sys.exit(1)

    input_file = Path(sys.argv[1])
    output_file = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("predictions.csv")

    art = load_artifact()
    data = pd.read_csv(input_file)
    preds = predict(data, art)
    preds.to_csv(output_file, index=False)
    print(f"Predictions saved to {output_file} ({len(preds)} rows)")
    print(preds.head())
