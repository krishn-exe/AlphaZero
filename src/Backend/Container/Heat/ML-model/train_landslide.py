"""
train_landslide.py
------------------
Trains:
  1. XGBoost classifier  -> raw probability
  2. Platt calibration   -> smooth, trustworthy 0-1 landslide score
  3. XGBoost quantile regressor (p10/p50/p90 of hours-to-failure)
     ONLY if the dataset contains time-to-failure information.
     Otherwise the inference code falls back to a heuristic.

Run:  python train_landslide.py
"""

import os

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedGroupKFold, train_test_split
from xgboost import XGBClassifier, XGBRegressor

from landslide_predict import ID_COLUMNS, _logit, build_features

# ==========================================
# 1. CONFIGURATION
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = r"C:\Users\nisheet verma\OneDrive\Desktop\global_combined.csv"
MODEL_OUT = os.path.join(BASE_DIR, "landslide_model_v2.pkl")

SEED = 42

# Spatial split: rows within the same ~0.5 degree cell stay in the same
# split, so the test score is not inflated by near-duplicate neighbours
# (your negatives are sampled 3-15 km from positives).
SPATIAL_SPLIT = True
GRID_DEG = 0.5

# Time-to-failure label. Put the name of a column that holds
# "hours from feature snapshot until the landslide" for positive rows.
# If you instead have an event time column, set EVENT_TIME_COL and it is
# computed as (event time - Fetch_Timestamp) in hours.
TTF_COL_CANDIDATES = [
    "Hours_To_Failure", "Time_To_Failure", "Hours_To_Landslide", "TTF_Hours",
]
EVENT_TIME_COL = "Event_Timestamp"
TTF_MAX_HOURS = 72          # ignore/cap anything beyond this horizon
MIN_TTF_ROWS = 200          # skip regressor if fewer positives than this

# ==========================================
# 2. LOAD + CLEAN
# ==========================================
print("Loading dataset...")
df = pd.read_csv(DATA_PATH).drop_duplicates().reset_index(drop=True)

if df["Label"].isna().any():
    raise ValueError("Label contains missing values.")
if not set(df["Label"].unique()).issubset({0, 1}):
    raise ValueError("Label must contain only 0 and 1.")
df["Label"] = df["Label"].astype(int)

# --- spatial groups (before Latitude/Longitude are dropped) ---
if SPATIAL_SPLIT and {"Latitude", "Longitude"}.issubset(df.columns):
    gx = np.floor(df["Latitude"] / GRID_DEG).astype(int).astype(str)
    gy = np.floor(df["Longitude"] / GRID_DEG).astype(int).astype(str)
    df["_group"] = gx + "_" + gy
else:
    df["_group"] = np.nan
    SPATIAL_SPLIT = False

# --- time-to-failure target (before Fetch_Timestamp is dropped) ---
df["_ttf"] = np.nan
ttf_col = next((c for c in TTF_COL_CANDIDATES if c in df.columns), None)
if ttf_col:
    df["_ttf"] = pd.to_numeric(df[ttf_col], errors="coerce")
    print(f"Using '{ttf_col}' as time-to-failure target.")
elif EVENT_TIME_COL in df.columns and "Fetch_Timestamp" in df.columns:
    ev = pd.to_datetime(df[EVENT_TIME_COL], errors="coerce")
    fe = pd.to_datetime(df["Fetch_Timestamp"], errors="coerce")
    df["_ttf"] = (ev - fe).dt.total_seconds() / 3600.0
    print(f"Computed time-to-failure from {EVENT_TIME_COL} - Fetch_Timestamp.")
else:
    print("No time-to-failure column found -> heuristic hours will be used.")

df.loc[(df["_ttf"] <= 0) | (df["_ttf"] > TTF_MAX_HOURS), "_ttf"] = np.nan
df.loc[df["Label"] == 0, "_ttf"] = np.nan   # only positives have a TTF

# --- physical filter (same as before) ---
df = df[~((df["Label"] == 1) & (df["Slope_Angle"] < 5))].copy().reset_index(drop=True)
print("Dataset shape:", df.shape)

# ==========================================
# 3. FEATURES
# ==========================================
helper_cols = ["Label", "_group", "_ttf"] + (
    [ttf_col] if ttf_col else []
) + ([EVENT_TIME_COL] if EVENT_TIME_COL in df.columns else [])

feat_df = build_features(df.drop(columns=[c for c in ID_COLUMNS if c in df.columns]))
X = feat_df.drop(columns=[c for c in helper_cols if c in feat_df.columns])
y = df["Label"]
ttf = df["_ttf"]
groups = df["_group"].values

non_numeric = X.select_dtypes(exclude=np.number).columns.tolist()
if non_numeric:
    raise ValueError(f"Encode non-numeric columns before training: {non_numeric}")

# ==========================================
# 4. TRAIN / VAL / TEST SPLIT
# ==========================================
if SPATIAL_SPLIT:
    outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
    trval_idx, test_idx = next(outer.split(X, y, groups))
    inner = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=SEED)
    tr_rel, val_rel = next(
        inner.split(X.iloc[trval_idx], y.iloc[trval_idx], groups[trval_idx])
    )
    train_idx, val_idx = trval_idx[tr_rel], trval_idx[val_rel]
else:
    idx = np.arange(len(X))
    trval_idx, test_idx = train_test_split(
        idx, test_size=0.20, random_state=SEED, stratify=y
    )
    train_idx, val_idx = train_test_split(
        trval_idx, test_size=0.25, random_state=SEED, stratify=y.iloc[trval_idx]
    )

X_train, y_train = X.iloc[train_idx], y.iloc[train_idx]
X_val, y_val = X.iloc[val_idx], y.iloc[val_idx]
X_test, y_test = X.iloc[test_idx], y.iloc[test_idx]

print(f"\nSpatial split: {SPATIAL_SPLIT}")
print("Train/Val/Test:", X_train.shape, X_val.shape, X_test.shape)

# ==========================================
# 5. CLASSIFIER
# ==========================================
import random

spw = (y_train == 0).sum() / (y_train == 1).sum()

search_space = {
    "max_depth":        [3, 4, 5, 6, 7],
    "min_child_weight": [1, 3, 5, 10],
    "subsample":        [0.7, 0.8, 0.9],
    "colsample_bytree": [0.6, 0.8, 1.0],
    "reg_lambda":       [1, 2, 5, 10],
    "gamma":            [0, 0.1, 0.5],
}

random.seed(SEED)
clf, best_score = None, -1
print("\nTrying 15 setting combinations...")
for trial in range(15):
    params = {k: random.choice(v) for k, v in search_space.items()}
    m = XGBClassifier(
        n_estimators=2000,
        learning_rate=0.03,
        reg_alpha=0.1,
        scale_pos_weight=spw,
        objective="binary:logistic",
        eval_metric="aucpr",
        early_stopping_rounds=50,
        random_state=SEED,
        n_jobs=-1,
        **params,
    )
    m.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    print(f"  trial {trial + 1:2d}: val PR-AUC {m.best_score:.4f}  {params}")
    if m.best_score > best_score:
        best_score, clf = m.best_score, m

print(f"\nBest val PR-AUC: {best_score:.4f}")
print("Best iteration:", clf.best_iteration)

# ==========================================
# 6. CALIBRATION -> continuous 0-1 score
# ==========================================
# scale_pos_weight skews raw probabilities, so we recalibrate with Platt
# scaling (logistic regression on the logit). Result is smooth and
# monotonic: higher score = genuinely higher chance.
val_raw = clf.predict_proba(X_val)[:, 1]
calibrator = LogisticRegression(C=1e6, max_iter=1000)
calibrator.fit(_logit(val_raw), y_val)


def score_fn(Xd):
    raw = clf.predict_proba(Xd)[:, 1]
    return calibrator.predict_proba(_logit(raw))[:, 1]


val_score = score_fn(X_val)

best_t, best_f1 = 0.5, -1
for t in np.arange(0.10, 0.91, 0.01):
    f = f1_score(y_val, (val_score >= t).astype(int), zero_division=0)
    if f > best_f1:
        best_f1, best_t = f, float(t)
print(f"\nThreshold (on calibrated val score): {best_t:.2f}  | val F1: {best_f1:.4f}")

# ==========================================
# 7. TEST EVALUATION (classifier)
# ==========================================
test_raw = clf.predict_proba(X_test)[:, 1]
test_score = score_fn(X_test)
test_pred = (test_score >= best_t).astype(int)

print("\n========== CLASSIFIER TEST RESULTS ==========")
print(f"Accuracy:   {accuracy_score(y_test, test_pred):.4f}")
print(f"Precision:  {precision_score(y_test, test_pred, zero_division=0):.4f}")
print(f"Recall:     {recall_score(y_test, test_pred, zero_division=0):.4f}")
print(f"F1:         {f1_score(y_test, test_pred, zero_division=0):.4f}")
print(f"ROC-AUC:    {roc_auc_score(y_test, test_score):.4f}")
print(f"PR-AUC:     {average_precision_score(y_test, test_score):.4f}")
print(f"Log loss:   raw {log_loss(y_test, test_raw):.4f} -> calibrated {log_loss(y_test, test_score):.4f}")
print(f"Brier:      raw {brier_score_loss(y_test, test_raw):.4f} -> calibrated {brier_score_loss(y_test, test_score):.4f}")
print("Confusion matrix:\n", confusion_matrix(y_test, test_pred))

# Reliability table: predicted score vs actual landslide rate
bins = pd.cut(test_score, [0, .1, .25, .5, .75, .9, 1.0], include_lowest=True)
rel = (
    pd.DataFrame({"score": test_score, "actual": y_test.values, "bin": bins})
    .groupby("bin", observed=True)
    .agg(n=("actual", "size"), mean_score=("score", "mean"), actual_rate=("actual", "mean"))
)
print("\nReliability (mean_score should be close to actual_rate):\n", rel.round(3))

# ==========================================
# 8. TIME-TO-FAILURE MODEL (only if labels exist)
# ==========================================
ttf_model = None
pos_train = (y_train == 1) & ttf.iloc[train_idx].notna()
pos_val = (y_val == 1) & ttf.iloc[val_idx].notna()
pos_test = (y_test == 1) & ttf.iloc[test_idx].notna()

if pos_train.sum() >= MIN_TTF_ROWS and pos_val.sum() >= 30:
    print(f"\nTraining time-to-failure model on {pos_train.sum()} positives...")
    ttf_model = XGBRegressor(
        objective="reg:quantileerror",
        quantile_alpha=np.array([0.1, 0.5, 0.9]),   # needs xgboost >= 2.0
        n_estimators=1500,
        learning_rate=0.03,
        max_depth=4,
        min_child_weight=3,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_lambda=2,
        early_stopping_rounds=50,
        random_state=SEED,
        n_jobs=-1,
    )
    ttf_model.fit(
        X_train[pos_train],
        np.log1p(ttf.iloc[train_idx][pos_train]),
        eval_set=[(X_val[pos_val], np.log1p(ttf.iloc[val_idx][pos_val]))],
        verbose=100,
    )

    if pos_test.sum() > 0:
        q = np.sort(ttf_model.predict(X_test[pos_test]), axis=1)
        q = np.expm1(q)
        true_h = ttf.iloc[test_idx][pos_test].values
        mae = mean_absolute_error(true_h, q[:, 1])
        cover = np.mean((true_h >= q[:, 0]) & (true_h <= q[:, 2]))
        print("\n========== TIME-TO-FAILURE TEST RESULTS ==========")
        print(f"Median-prediction MAE: {mae:.2f} hours")
        print(f"P10-P90 interval coverage: {cover:.2%} (ideal ~80%)")
else:
    print("\nSkipping TTF regressor (not enough labelled positives).")
    print("predict() will use the heuristic hours estimate instead.")

# ==========================================
# 9. SAVE
# ==========================================
heuristic_refs = {}
for col in ["Rainfall_3Day", "Soil_Saturation"]:
    if col in X_train.columns:
        heuristic_refs[col] = float(X_train[col].quantile(0.90))

artifact = {
    "clf": clf,
    "calibrator": calibrator,
    "threshold": best_t,
    "features": X.columns.tolist(),
    "ttf_model": ttf_model,
    "ttf_max_hours": TTF_MAX_HOURS,
    "heuristic_refs": heuristic_refs,
    "train_rate": float(y_val.mean()),
}
joblib.dump(artifact, MODEL_OUT)
print("\nSaved:", MODEL_OUT)