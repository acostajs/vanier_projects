import pandas as pd
from prophet import Prophet
import os
import logging

logging.getLogger("cmdstanpy").setLevel(logging.WARNING)
logging.getLogger("prophet").setLevel(logging.WARNING)


def generate_forecast(days_to_predict=7):
    """
    Generates a sales/demand forecast using Prophet.

    Args:
        days_to_predict (int): Number of days into the future to forecast.

    Returns:
        pandas.DataFrame: A DataFrame containing the forecast with columns
                          ['ds', 'yhat', 'yhat_lower', 'yhat_upper']
                          Returns None if an error occurs (e.g., file not found).
    """
    print("Attempting to generate forecast...") 

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data_dir = os.path.join(os.path.dirname(base_dir), "data")
    file_path = os.path.join(data_dir, "historical_sales.csv")

    print(f"Looking for data file at: {file_path}")

    try:
        df = pd.read_csv(file_path)
        print(f"Successfully read {len(df)} rows from {file_path}")

        df["ds"] = pd.to_datetime(df["ds"])

        if "ds" not in df.columns or "y" not in df.columns:
            print("Error: CSV must contain 'ds' and 'y' columns.")
            return None

        if len(df) < 2:
            print("Error: Need at least 2 data points to create a forecast.")
            return None

        # --- Model Training & Forecasting ---
        # Initialize Prophet model
        m = Prophet()

        print("Fitting Prophet model...")
        m.fit(df)
        print("Model fitting complete.")

        future = m.make_future_dataframe(periods=days_to_predict)

        print(f"Generating forecast for {days_to_predict} days...")
        forecast = m.predict(future)
        print("Forecast generation complete.")

        forecast_subset = forecast[["ds", "yhat", "yhat_lower", "yhat_upper"]]

        print("Forecast results (tail):")
        print(forecast_subset.tail())

        return forecast_subset

    except FileNotFoundError:
        print(f"Error: Data file not found at {file_path}")
        return None
    except Exception as e:
        print(f"An error occurred during forecasting: {e}")
        return None

if __name__ == "__main__":
    print("Running forecast generation directly...")
    forecast_result = generate_forecast(days_to_predict=14)
    if forecast_result is not None:
        print("\nFunction call successful. Result head:")
        print(forecast_result.head())
    else:
        print("\nFunction call failed.")
