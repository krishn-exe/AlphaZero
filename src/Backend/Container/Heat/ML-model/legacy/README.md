# Retired Model Documentation (Model v1 - Legacy)

## Overview
This directory preserves the retired legacy landslide prediction assets (Model v1) for historical auditability and reproducibility.

### Retired Assets:
* **landslide_model_v1.pkl**: Original raw XGBoost binary classifier (`n_estimators=100`, `max_depth=6`).
* **predict_v1.py**: Legacy script calling `model.predict_proba(...)` directly on 24 uncalibrated features.
* **train_v1.py**: Legacy training script trained on `train_1.csv`.

### Reasons for Retirement:
1. **Uncalibrated Probabilities**: Model v1 was trained on an artificially balanced dataset and emitted uncalibrated probabilities via raw `predict_proba`.
2. **Missing Interaction Terms**: Did not take into account physical interactions such as rainfall-slope interactions (`Rainfall_Slope_Interaction`) or saturation-slope interactions (`Saturation_Slope_Interaction`).
3. **Replaced by Model v2**: Swapped for the new calibrated model artifact (`landslide_model_v2.pkl`) which features:
   - Platt scaling (`LogisticRegression` calibrator) transforming log-odds into smooth, empirically grounded probability scores in [0.0, 1.0].
   - Integrated spatial interaction features.
   - Dynamic thresholding and optional time-to-failure (TTF) estimation.
