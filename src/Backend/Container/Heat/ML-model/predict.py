"""
predict.py
----------
Inference runner for Landslide Early Warning System.
Loads the calibrated probabilistic XGBoost model artifact (landslide_model_v2.pkl),
computes interaction features, evaluates risk ratings [0.0000, 1.0000],
and saves predictions.
"""

import os
import sys
from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
from landslide_predict import load_artifact, predict

# Artifact path: preferentially load v2, fallback to legacy
MODEL_V2_PATH = BASE_DIR / "landslide_model_v2.pkl"
MODEL_LEGACY_PATH = BASE_DIR / "landslide_model.pkl"

model_path = MODEL_V2_PATH if MODEL_V2_PATH.exists() else MODEL_LEGACY_PATH
if not model_path.exists():
    raise FileNotFoundError(f"Model artifact not found at {MODEL_V2_PATH} or {MODEL_LEGACY_PATH}")

print(f"Loading model artifact from: {model_path.name}")
artifact = load_artifact(str(model_path))

# Input dataset path
input_csv = BASE_DIR / ".." / ".." / "data" / "output.csv"
if not input_csv.exists():
    raise FileNotFoundError(f"Input data not found at {input_csv.resolve()}")

input_df = pd.read_csv(input_csv)
print(f"Input data loaded: {len(input_df)} rows")

# Run prediction using calibrated model artifact
predictions = predict(input_df, artifact)

# Save prediction output
output_path = BASE_DIR / "predicted_risk_output.csv"
# Ensure Latitude, Longitude, Risk_Rating are present
predictions.to_csv(output_path, index=False)

print(f"Predictions saved successfully to: {output_path.resolve()}")
print(predictions.head())
