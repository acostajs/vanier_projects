import PerformanceLog, { IPerformanceLog } from '../models/PerformanceLog';
import mongoose from 'mongoose';
import { IEmployee } from '../models/Employee'

interface PerformanceLogData {
  employee: string | mongoose.Types.ObjectId; 
  log_date: string | Date; 
  rating?: number;
  notes?: string;
}

/**
 * Creates and saves a new performance log entry.
 * @param data - The performance log data from the form.
 * @returns The saved performance log document.
 * @throws Error if validation or saving fails.
 */
export const createPerformanceLog = async (data: PerformanceLogData): Promise<IPerformanceLog> => {
    console.log('[Performance Service] Received data for new log:', data);

    const logDate = new Date(data.log_date); 
    const employeeId = data.employee;

    try {
        const year = logDate.getUTCFullYear();
        const month = logDate.getUTCMonth(); 

        // Start of the month for logDate
        const startDateOfMonth = new Date(Date.UTC(year, month, 1));
        // Start of the *next* month
        const startDateOfNextMonth = new Date(Date.UTC(year, month + 1, 1));

        console.log(`[Performance Service] Checking for existing log for employee ${employeeId} between ${startDateOfMonth.toISOString()} and ${startDateOfNextMonth.toISOString()}`);

        const existingLog = await PerformanceLog.findOne({
            employee: employeeId,
            log_date: {
                $gte: startDateOfMonth,
                $lt: startDateOfNextMonth 
            }
        });

        if (existingLog) {
            console.warn(`[Performance Service] Duplicate log detected for employee ${employeeId} for month ${year}-${month + 1}. Existing log ID: ${existingLog._id}`);
            throw new Error(`A performance log already exists for this employee for ${startDateOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}.`);
        }
        console.log(`[Performance Service] No existing log found for employee ${employeeId} in ${year}-${month + 1}. Proceeding to save.`);

    } catch (error) {
        console.error('[Performance Service] Error during duplicate check:', error);
        if (error instanceof Error && error.message.startsWith('A performance log already exists')) {
            throw error;
        }
        throw new Error(`Failed to check for existing performance logs: ${error instanceof Error ? error.message : String(error)}`);
    }

    const performanceLog = new PerformanceLog({
        employee: employeeId,
        log_date: logDate, 
        rating: data.rating,
        notes: data.notes,
    });

    try {
        const savedLog = await performanceLog.save();
        console.log('[Performance Service] Performance log saved successfully:', savedLog._id);
        return savedLog;
    } catch (error) {
        console.error('[Performance Service] Error saving performance log:', error);
        throw error;
    }
};

/**
 * Fetches performance logs (implementation later).
 */
export const getPerformanceLogs = async (): Promise<IPerformanceLog[]> => {
    console.log('[Performance Service] Fetching performance logs...');
    try {
        const logs = await PerformanceLog.find({})
        .populate('employee')
        .sort({ log_date: -1 }); 

        console.log(`[Performance Service] Found ${logs.length} performance logs.`);
        return logs;
    } catch (error) {
        console.error('[Performance Service] Error fetching performance logs:', error);
        throw new Error(`Error fetching performance logs: ${error instanceof Error ? error.message : String(error)}`);
    }
};
