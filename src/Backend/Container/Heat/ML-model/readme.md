# Landslide Risk ML Model

## Model v2 (Calibrated Probabilistic Inference)
The active production model is `landslide_model_v2.pkl`, loaded and evaluated via `landslide_predict.py` and `predict.py`.

### Key Features & Architecture:
* **Calibrated Probability [0.0, 1.0]**: Combines an XGBoost classifier with Platt calibration (`calibrator`) over logit-transformed raw probabilities to yield well-calibrated continuous risk scores.
* **Feature Interactions**: Automatically generates `Rainfall_Slope_Interaction` and `Saturation_Slope_Interaction`.
* **Output Attributes**:
  - `Risk_Rating` / `landslide_score`: Calibrated risk probability between 0.0000 and 1.0000.
  - `risk_level`: Low / Moderate / High / Critical.
  - `landslide_predicted`: Binary alert flag (1 if score >= calibrated threshold, else 0).
  - `hours_to_landslide`: Time-to-failure horizon estimation.

### Execution:
* Standalone batch prediction:
  ```bash
  .venv\Scripts\python.exe Heat/ML-model/predict.py
  ```
* Daemon pipeline orchestrator:
  ```bash
  .venv\Scripts\python.exe Heat/run.py --daemon
  ```
