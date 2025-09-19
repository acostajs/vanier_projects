import pandas as pd
from prophet import Prophet
import sys
import json
import argparse
import logging
import warnings

warnings.simplefilter("ignore") 
logging.getLogger('cmdstanpy').setLevel(logging.WARNING)
logging.getLogger('prophet').setLevel(logging.WARNING)
logging.basicConfig(level=logging.WARNING) 

def run_forecast(data_path, periods_to_predict):
    """
    Reads historical data, runs Prophet forecast, and prints results as JSON to stdout.
    Prints errors as JSON to stderr.
    """
    try:
        if not isinstance(periods_to_predict, int) or periods_to_predict <= 0:
            raise ValueError("Periods to predict must be a positive integer.")

        try:
            df = pd.read_csv(data_path)
        except FileNotFoundError:
            raise ValueError(f"Data file not found at: {data_path}")
        except Exception as e:
            raise ValueError(f"Error reading CSV file: {e}")

        if 'ds' not in df.columns or 'y' not in df.columns:
            raise ValueError("CSV input must contain 'ds' and 'y' columns.")

        try:
            df['ds'] = pd.to_datetime(df['ds'])
        except Exception as e:
            raise ValueError(f"Error converting 'ds' column to datetime: {e}")

        try:
            df['y'] = pd.to_numeric(df['y'])
        except Exception as e:
             raise ValueError(f"Error converting 'y' column to numeric: {e}")

        if len(df) < 2:
            raise ValueError("Need at least 2 data points for forecasting.")

        m = Prophet()
        m.fit(df)

        future = m.make_future_dataframe(periods=periods_to_predict)
        forecast = m.predict(future)

        forecast_output = forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].copy()
        forecast_output['ds'] = forecast_output['ds'].dt.strftime('%Y-%m-%d')

        print(forecast_output.to_json(orient='records', date_format='iso'))
        sys.stdout.flush() 

    except Exception as e:
        error_output = json.dumps({"error": str(e)})
        print(error_output, file=sys.stderr)
        sys.stderr.flush() 
        sys.exit(1) 

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate forecast using Prophet.')
    parser.add_argument('--data', required=True, help='Path to the historical data CSV file.')
    parser.add_argument('--days', required=True, type=int, help='Number of days to predict.')

    args = parser.parse_args()

    run_forecast(args.data, args.days)