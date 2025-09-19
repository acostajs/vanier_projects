import { spawn } from 'child_process'; 
import path from 'path';               


interface ForecastResult {
    ds: string; // Date string 'YYYY-MM-DD'
    yhat: number;
    yhat_lower: number;
    yhat_upper: number;
}

/**
 * Calls the Python Prophet script to generate a forecast.
 * @param daysToPredict Number of days into the future to forecast.
 * @returns A Promise that resolves with an array of ForecastResult objects or rejects with an error.
 */
export const generateForecast = (daysToPredict: number): Promise<ForecastResult[]> => {
    console.log(`[Forecasting Service] Requesting forecast for ${daysToPredict} days...`);

    const pythonExecutable = 'python3';
    const scriptPath = path.join('/app', 'python_scripts', 'forecast_demand.py');
    const dataPath = path.join('/app', 'data', 'historical_sales.csv');
    
    return new Promise((resolve, reject) => {
        const args = [ scriptPath, '--data', dataPath, '--days', String(daysToPredict) ];
        console.log(`[Forecasting Service] Spawning: ${pythonExecutable} ${args.join(' ')}`);
        const pythonProcess = spawn(pythonExecutable, args);

        let stdoutData = ''; 
        let stderrData = ''; 

        pythonProcess.stdout.on('data', (data) => {
            stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            stderrData += data.toString();
            console.error(`[Python Script STDERR]: ${data.toString()}`);
        });


        pythonProcess.on('close', (code) => {
            console.log(`[Forecasting Service] Python script exited with code ${code}`);
            if (code === 0) { 
                try {
                    console.log("[Forecasting Service] Raw stdout:", stdoutData); 
                    const forecastResults: ForecastResult[] = JSON.parse(stdoutData);
                    console.log(`[Forecasting Service] Forecast parsed successfully (${forecastResults.length} records).`);
                    resolve(forecastResults); 
                } catch (parseError: any) {
                    console.error('[Forecasting Service] Error parsing Python script JSON output:', parseError);
                    console.error('[Forecasting Service] Raw stdout received:', stdoutData); 
                    reject(new Error(`Failed to parse forecast JSON output: ${parseError.message}`));
                }
            } else { 
                console.error(`[Forecasting Service] Python script failed (code ${code}). STDERR: ${stderrData}`);
                let errorMessage = `Python script failed with code ${code}.`;
                try {
                    const errorJson = JSON.parse(stderrData);
                    if (errorJson && errorJson.error) {
                        errorMessage += ` Error: ${errorJson.error}`;
                    } else {
                        errorMessage += ` stderr: ${stderrData || '(No stderr output)'}`;
                    }
                } catch (e) {
                    errorMessage += ` stderr: ${stderrData || '(No stderr output - and stderr not JSON)'}`;
                }
                reject(new Error(errorMessage)); 
            }
        });

        pythonProcess.on('error', (error) => {
            console.error('[Forecasting Service] Failed to start Python script process:', error);
            reject(new Error(`Failed to start Python script: ${error.message}`));
        });
    });
};