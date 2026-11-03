"""
predict.py
----------
Inference runner for Landslide Early Warning System.
Loads the active XGBoost Risk Regressor model artifact from the New model folder
(landslide_risk_regressor.pkl), computes interaction features, and generates Risk_Rating [0.0000, 1.0000].
"""

import os
import sys
from pathlib import Path
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
CONTAINER_DIR = BASE_DIR.parent.parent
NEW_MODEL_DIR = CONTAINER_DIR / "New model"

sys.path.insert(0, str(NEW_MODEL_DIR))
sys.path.insert(0, str(BASE_DIR))

from landslide_regressor import load_artifact, predict

# Active model path is inside New model folder
ACTIVE_MODEL_PATH = NEW_MODEL_DIR / "landslide_risk_regressor.pkl"
LOCAL_MODEL_PATH = BASE_DIR / "landslide_risk_regressor.pkl"

model_path = ACTIVE_MODEL_PATH if ACTIVE_MODEL_PATH.exists() else LOCAL_MODEL_PATH
if not model_path.exists():
    raise FileNotFoundError(f"Model artifact not found at {ACTIVE_MODEL_PATH} or {LOCAL_MODEL_PATH}")

print(f"Loading active model artifact from: {model_path.resolve()}")
artifact = load_artifact(str(model_path))

# Input dataset path
input_csv = CONTAINER_DIR / "data" / "output.csv"
if not input_csv.exists():
    raise FileNotFoundError(f"Input data not found at {input_csv.resolve()}")

input_df = pd.read_csv(input_csv)
print(f"Input data loaded: {len(input_df)} rows")

# Run prediction using active regressor model
predictions = predict(input_df, artifact)

# Save prediction output
output_path = BASE_DIR / "predicted_risk_output.csv"
predictions[["Latitude", "Longitude", "Risk_Rating"]].to_csv(output_path, index=False)

print(f"Predictions saved successfully to: {output_path.resolve()}")
print(predictions.head())
