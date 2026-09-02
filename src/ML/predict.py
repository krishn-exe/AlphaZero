import os
import joblib
import pandas as pd

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(BASE_DIR, 'landslide_model.pkl')
model = joblib.load(model_path)


# input fetch karke 'input_df' m store kr lena 


X_input = input_df.drop(['Latitude', 'Longitude', 'Fetch_Timestamp'], axis=1)


# 'input_df' m ek column add kr diya h 'Risk Rating' isme he prediction h fir uske ek nhi file m csv format k store ke liya h 


risk_ratings = model.predict_proba(X_input)[:, 1]
input_df['Risk_Rating'] = risk_ratings.round(4)
output_path = os.path.join(BASE_DIR, 'predicted_risk_output.csv')
input_df.to_csv(output_path, index=False)

print("Predictions saved")
print(input_df.head())