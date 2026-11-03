import os
import joblib
import numpy as np
import pandas as pd

from scipy.stats import kstest
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import QuantileTransformer
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    brier_score_loss,
    mean_squared_error,
)

# ==========================================
# HELPERS
# ==========================================

def fit_uniformizer(raw_scores):
    """Learn the mapping raw score -> percentile (uniform on 0-1)."""
    qt = QuantileTransformer(
        n_quantiles=min(1000, len(raw_scores)),
        output_distribution="uniform",
        random_state=42,
    )
    qt.fit(np.asarray(raw_scores).reshape(-1, 1))
    return qt


def predict_risk(artifact, X_new, refit_on_new=False):
    """
    Returns (raw_probability, risk_rating) for new data.

    refit_on_new=False -> risk_rating is uniform relative to the
                          TRAINING reference population.
    refit_on_new=True  -> risk_rating is uniform across THIS batch
                          (e.g. the live grid), i.e. a relative ranking
                          of the points you are scoring right now.
    """
    X_new = X_new[artifact["features"]].replace([np.inf, -np.inf], np.nan)
    raw = artifact["model"].predict(X_new)

    uniformizer = fit_uniformizer(raw) if refit_on_new else artifact["uniformizer"]
    risk = uniformizer.transform(raw.reshape(-1, 1)).ravel()
    return raw, risk


# ==========================================
# 1. CONFIGURATION
# ==========================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_output = os.path.join(BASE_DIR, "landslide_risk_regressor.pkl")

print("Loading dataset...")
df = pd.read_csv(r"C:\Users\nisheet verma\OneDrive\Desktop\global_combined.csv")
df = df.drop_duplicates().reset_index(drop=True)

# ==========================================
# 2. DATA CLEANING (same as classifier)
# ==========================================

columns_to_drop = ["Latitude", "Longitude", "Fetch_Timestamp"]
df = df.drop(columns=[c for c in columns_to_drop if c in df.columns], errors="ignore")

if df["Label"].isna().any():
    raise ValueError("Label contains missing values.")
if not set(df["Label"].unique()).issubset({0, 1}):
    raise ValueError("Label must contain only 0 and 1.")
df["Label"] = df["Label"].astype(int)

df = df[~((df["Label"] == 1) & (df["Slope_Angle"] < 5))].copy()
print("Dataset shape:", df.shape)

# ==========================================
# 3. FEATURE ENGINEERING (same as classifier)
# ==========================================

if "Rainfall_mm" in df.columns and "Slope_Angle" in df.columns:
    df["Rainfall_Slope_Interaction"] = df["Rainfall_mm"] * df["Slope_Angle"]

if "Soil_Saturation" in df.columns and "Slope_Angle" in df.columns:
    df["Saturation_Slope_Interaction"] = df["Soil_Saturation"] * df["Slope_Angle"]

X = df.drop(columns=["Label"])
y = df["Label"]

non_numeric = X.select_dtypes(exclude=np.number).columns.tolist()
if non_numeric:
    raise ValueError(f"Encode non-numeric columns before training: {non_numeric}")

X = X.replace([np.inf, -np.inf], np.nan)

# ==========================================
# 4. SPLITS (60 / 20 / 20, same seeds as classifier)
# ==========================================

X_train_val, X_test, y_train_val, y_test = train_test_split(
    X, y, test_size=0.20, random_state=42, stratify=y
)
X_train, X_val, y_train, y_val = train_test_split(
    X_train_val, y_train_val, test_size=0.25, random_state=42, stratify=y_train_val
)

print("Training:", X_train.shape, "| Validation:", X_val.shape, "| Test:", X_test.shape)

# ==========================================
# 5. XGBOOST REGRESSOR (probability of landslide)
# ==========================================
# reg:logistic = squared-error loss on a sigmoid output, so predictions
# are always inside (0, 1) and act as probabilities.
# NOTE: no scale_pos_weight here. Class weighting inflates scores and
# would make them useless as a 0-1 risk estimate.

model = XGBRegressor(
    objective="reg:logistic",
    eval_metric="rmse",
    n_estimators=2000,
    learning_rate=0.03,
    max_depth=5,
    min_child_weight=3,
    subsample=0.8,
    colsample_bytree=0.8,
    gamma=0.1,
    reg_alpha=0.1,
    reg_lambda=2,
    early_stopping_rounds=50,
    random_state=42,
    n_jobs=-1,
)

print("\nTraining XGBoost risk regressor...")
model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=100)
print("Best iteration:", model.best_iteration)

# ==========================================
# 6. MAKE THE SCORE UNIFORM ON 0-1
# ==========================================
# Fit the percentile mapping on VALIDATION predictions (not train:
# train predictions are overfit and too extreme).

val_raw = model.predict(X_val)
uniformizer = fit_uniformizer(val_raw)

# ==========================================
# 7. TEST EVALUATION
# ==========================================

test_raw = model.predict(X_test)
test_risk = uniformizer.transform(test_raw.reshape(-1, 1)).ravel()

print("\n========== TEST RESULTS ==========")
print(f"ROC-AUC (raw):          {roc_auc_score(y_test, test_raw):.4f}")
print(f"ROC-AUC (risk rating):  {roc_auc_score(y_test, test_risk):.4f}  (should be identical)")
print(f"PR-AUC  (raw):          {average_precision_score(y_test, test_raw):.4f}")
print(f"Brier score (raw):      {brier_score_loss(y_test, test_raw):.4f}")
print(f"RMSE (raw):             {np.sqrt(mean_squared_error(y_test, test_raw)):.4f}")

ks_stat, ks_p = kstest(test_risk, "uniform")
print(f"\nKS distance from uniform: {ks_stat:.4f}  (closer to 0 = flatter)")

print("\nRisk-rating histogram (share of test samples per 0.1 bin):")
hist, _ = np.histogram(test_risk, bins=np.linspace(0, 1, 11))
print(np.round(hist / hist.sum(), 3))

# The real validation: does the actual landslide rate rise with the rating?
bins = pd.cut(test_risk, bins=np.linspace(0, 1, 11), include_lowest=True)
table = (
    pd.DataFrame({"bin": bins, "label": y_test.values})
    .groupby("bin", observed=True)["label"]
    .agg(["count", "mean"])
)
table.columns = ["n_samples", "observed_landslide_rate"]
print("\nObserved landslide rate per risk bin:")
print(table)

importances = pd.Series(model.feature_importances_, index=X.columns).sort_values(ascending=False)
print("\nTop 15 Feature Importances:")
print(importances.head(15))

# ==========================================
# 8. SAVE
# ==========================================

artifact = {
    "model": model,
    "uniformizer": uniformizer,
    "features": X.columns.tolist(),
    "best_iteration": model.best_iteration,
}
joblib.dump(artifact, model_output)
print("\nModel saved:", model_output)

# ==========================================
# LIVE USAGE EXAMPLE
# ==========================================
# artifact = joblib.load("landslide_risk_regressor.pkl")
# raw, risk = predict_risk(artifact, live_grid_df, refit_on_new=True)
# live_grid_df["Risk_Rating"] = risk