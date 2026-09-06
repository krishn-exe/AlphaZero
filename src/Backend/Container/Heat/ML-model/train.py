import os
import joblib
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

data_file = os.path.join(BASE_DIR, "train_1.csv")
model_output = os.path.join(BASE_DIR, "landslide_model.pkl")

print("Loading dataset...")
df = pd.read_csv(data_file)
df = df.drop(
    columns=[
        'Rainfall_7Day', 'Soil_Type_Gravel', 'Soil_Type_Sand', 'Soil_Type_Silt',
        'Soil_Type_Clay', 'Pore_Water_Pressure_kPa', 'Microseismic_Activity',
        'Acoustic_Emission_dB', 'Soil_Strain', 
        'TDR_Reflection_Index']
)

print(list(df.columns))

target_col = 'Label'
X = df.drop(columns=['Label'])
y = df['Label']
print(f"Total Features: {X.shape[1]} | Samples: {X.shape[0]}")


X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
model = XGBClassifier(
    n_estimators=100,
    learning_rate=0.05,
    max_depth=6,
    random_state=42)

model.fit(X_train, y_train)

y_proba = model.predict_proba(X_test)[:, 1]
print(f"ROC-AUC Score: {roc_auc_score(y_test, y_proba):.4f}")

joblib.dump(model, model_output)
print(f"Model saved successfully {model_output}")