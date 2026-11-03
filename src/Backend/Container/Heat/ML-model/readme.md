# Landslide Risk Prediction Models

## Active Production Model
* **Model File**: `New model/landslide_risk_regressor.pkl` (local replica at `Heat/ML-model/landslide_risk_regressor.pkl`)
* **Architecture**: `XGBRegressor` (`objective="reg:logistic"`, `eval_metric="rmse"`) + `QuantileTransformer` uniformizer.
* **Outputs**:
  - `Raw_Score`: Sigmoid output directly in `(0, 1)` representing empirical probability of landslide occurrence.
  - `Risk_Rating`: Uniformized percentile rank in `[0.0000, 1.0000]` calibrated against the validation distribution.
* **Feature Interactions**: Automatically computes `Rainfall_Slope_Interaction` and `Saturation_Slope_Interaction`.

## Retired Models
* **Model v1 (Legacy Binary Classifier)**: Moved to `Heat/ML-model/legacy/landslide_model_v1.pkl`.
  - Used binary 0/1 training objective with raw `predict_proba`.
  - Retired due to uncalibrated probability skew and lack of interaction terms.

## Running Inference
* Standalone script:
  ```bash
  .venv\Scripts\python.exe Heat/ML-model/predict.py
  ```
  or directly from `New model`:
  ```bash
  .venv\Scripts\python.exe "New model/predict.py" data/output.csv predictions.csv
  ```
* Daemon pipeline:
  ```bash
  .venv\Scripts\python.exe Heat/run.py --daemon
  ```
