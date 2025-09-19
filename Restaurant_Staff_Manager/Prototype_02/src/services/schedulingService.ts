import Shift, { IShift } from '../models/Shift'; 
import Employee, { IEmployee } from '../models/Employee'; 
import * as forecastingService from './forecastingService';
import mongoose from 'mongoose'; 
import * as notificationService from './notificationService';

function shuffleArray<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; 
    }
    return array;
}

function createUTCDateTime(baseDate: Date, timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const newDate = new Date(baseDate);
    newDate.setUTCHours(hours, minutes, 0, 0);
    return newDate;
}

function getWeekStartDate(date: Date): Date {
    const dateCopy = new Date(date.getTime()); 
    const dayOfWeek = dateCopy.getUTCDay(); 
    dateCopy.setUTCDate(dateCopy.getUTCDate() - dayOfWeek); 
    dateCopy.setUTCHours(0, 0, 0, 0); 
    return dateCopy;
}

const DEMAND_THRESHOLD = 175;

const SHIFT_TIMES = {
    DAY: { start: '10:00', end: '18:00' },
    EVE: { start: '16:00', end: '00:00' },
};

const BASE_NEEDS = {
    DAY: {
        'Manager': 1, 'Host/Hostess': 1, 'Server': 1, 'Bartender': 1,
        'Chef de Partie': 1, 'Cook': 2, 'Dishwasher': 1, 'Chef': 1,
    },
    EVE: {
        'Manager': 1, 'Host/Hostess': 1, 'Server': 3, 'Bartender': 1,
        'Chef de Partie': 2, 'Cook': 4, 'Dishwasher': 2, 'Sous Chef': 1,
    },
};

const HIGH_DEMAND_EXTRA = {
    'Server': 2,
    'Cook': 2,
};

const WEEKLY_HOUR_LIMIT = 40;
const SHIFT_DURATION = 8; 

type StaffNeeds = { [position: string]: number }; 

interface ForecastRecord {
    ds: string;
    yhat: number;
    yhat_lower: number;
    yhat_upper: number;
}

/**
 * Generates schedule... (generateSchedule function - unchanged from your paste)
 */
export const generateSchedule = async (targetStartDate: Date, targetEndDate: Date): Promise<IShift[]> => {
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const targetMonthStr = monthFormatter.format(targetStartDate);
    console.log(`[Scheduling Service] Requesting schedule generation for target month: ${targetMonthStr}`);
    console.log(`[Scheduling Service] Target Date Range: ${targetStartDate.toISOString()} to ${targetEndDate.toISOString()}`);
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const msPerDay = 1000 * 60 * 60 * 24;
        const endOfDayTargetEndDate = new Date(targetEndDate);
        endOfDayTargetEndDate.setUTCHours(23, 59, 59, 999);
        let daysToForecast = Math.ceil((endOfDayTargetEndDate.getTime() - today.getTime()) / msPerDay);
        daysToForecast = Math.max(1, daysToForecast) + 7;
        console.log(`[Scheduling Service] Forecasting for ${daysToForecast} days from today to cover the target month.`);
        const fullForecast: ForecastRecord[] = await forecastingService.generateForecast(daysToForecast);
        if (!fullForecast || fullForecast.length === 0) { throw new Error('Failed to retrieve valid forecast data.'); }
        console.log(`[Scheduling Service] Full forecast received for ${fullForecast.length} days.`);
        const relevantForecast = fullForecast.filter(record => {
            const recordDate = new Date(record.ds + 'T00:00:00Z');
            return recordDate >= targetStartDate && recordDate <= targetEndDate;
        });
        if (relevantForecast.length === 0) { console.warn(`[Scheduling Service] No forecast data found within the target month range (${targetMonthStr}). No shifts will be generated.`); return []; }
        console.log(`[Scheduling Service] Filtered forecast to ${relevantForecast.length} days relevant for ${targetMonthStr}.`);
        console.log(`[Scheduling Service] Clearing existing shifts for ${targetMonthStr} (${targetStartDate.toISOString().split('T')[0]} to ${targetEndDate.toISOString().split('T')[0]})...`);
        const deleteResult = await Shift.deleteMany({ shift_date: { $gte: targetStartDate, $lte: targetEndDate } });
        console.log(`[Scheduling Service] ${deleteResult.deletedCount} existing shifts deleted for the target month.`);
        const shiftsToCreate: Partial<IShift>[] = [];
        for (const dayForecast of relevantForecast) {
            const shiftDate = new Date(dayForecast.ds + 'T00:00:00Z');
            const demand = dayForecast.yhat;
            const isHighDemand = demand >= DEMAND_THRESHOLD;
            for (const shiftType of Object.keys(SHIFT_TIMES) as Array<keyof typeof SHIFT_TIMES>) {
                const { start, end } = SHIFT_TIMES[shiftType];
                const baseNeedsForShift = BASE_NEEDS[shiftType];
                const currentShiftNeeds: StaffNeeds = {};
                for (const position in baseNeedsForShift) { currentShiftNeeds[position] = baseNeedsForShift[position as keyof typeof baseNeedsForShift]; }
                if (isHighDemand && shiftType === 'EVE') {
                    for (const position in HIGH_DEMAND_EXTRA) { const extraCount = HIGH_DEMAND_EXTRA[position as keyof typeof HIGH_DEMAND_EXTRA]; currentShiftNeeds[position] = (currentShiftNeeds[position] || 0) + extraCount; }
                }
                for (const position in currentShiftNeeds) {
                    const count = currentShiftNeeds[position];
                    if (count > 0) { for (let i = 0; i < count; i++) { shiftsToCreate.push({ shift_date: new Date(shiftDate), start_time: start, end_time: end, required_position: position, assigned_employee: null }); } }
                }
            }
        }
        if (shiftsToCreate.length > 0) {
            console.log(`[Scheduling Service] Attempting to insert ${shiftsToCreate.length} new shifts for ${targetMonthStr}...`);
            const createdShifts = await Shift.insertMany(shiftsToCreate, { ordered: false });
            console.log(`[Scheduling Service] Successfully inserted ${createdShifts.length} shifts for ${targetMonthStr}.`);
            return createdShifts as IShift[];
        } else { console.log(`[Scheduling Service] No shifts needed generation for ${targetMonthStr}.`); return []; }
    } catch (error) {
        console.error(`[Scheduling Service] Error generating schedule for ${targetMonthStr}:`, error);
        let detailedMessage = 'Unknown error during schedule generation';
        if (error instanceof mongoose.Error.ValidationError) { console.error('Mongoose Validation Errors:', error.errors); detailedMessage = 'Database validation failed during shift creation.'; }
        else if (error instanceof Error) { if (error.name === 'BulkWriteError' && (error as any).writeErrors) { console.error('Mongoose Bulk Write Errors:', (error as any).writeErrors); detailedMessage = 'Database bulk write error during shift creation.'; } else { detailedMessage = error.message; } }
        else { detailedMessage = String(error); }
        throw new Error(`Schedule generation failed for ${targetMonthStr}: ${detailedMessage}`);
    }
};

/**
 * Fetches shifts... 
 */
export const getShiftsForPeriod = async (startDate: Date, endDate: Date): Promise<IShift[]> => {
    console.log(`[Scheduling Service] Fetching shifts from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    try {
        const shifts = await Shift.find({
            shift_date: { $gte: startDate, $lte: endDate }
        })
        .populate('assigned_employee')
        .sort({ shift_date: 1, start_time: 1 });
        console.log(`[Scheduling Service] Found ${shifts.length} shifts in the period.`);
        return shifts;
    } catch (error) {
        console.error('[Scheduling Service] Error fetching shifts:', error);
        let detailedMessage = 'Unknown error fetching shifts';
         if (error instanceof Error) { detailedMessage = error.message; }
         else { detailedMessage = String(error); }
        throw new Error(`Error fetching shifts for the specified period: ${detailedMessage}`);
    }
};

/**
 * Assigns employees... (assignEmployeesToShifts function - MODIFIED)
 */

export const assignEmployeesToShifts = async (startDate: Date, endDate: Date): Promise<number> => {
    const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const targetMonthStr = monthFormatter.format(startDate);
    console.log(`[Assignment Service] Starting assignment process for ${targetMonthStr} with overlap & ${WEEKLY_HOUR_LIMIT}h limit check...`);

    try {
        // 1. Fetch employees, group by position
        console.log('[Assignment Service] Fetching employees...');
        const allEmployees = await Employee.find({}); // No .lean()
        const employeesByPosition: { [position: string]: IEmployee[] } = {};
        allEmployees.forEach(emp => {
            const position = emp.position || 'Unknown';
            if (!employeesByPosition[position]) { employeesByPosition[position] = []; }
            employeesByPosition[position].push(emp);
        });
        console.log(`[Assignment Service] Found ${allEmployees.length} employees across ${Object.keys(employeesByPosition).length} positions.`);

        // 2. Fetch unassigned shifts for the period
        console.log(`[Assignment Service] Fetching unassigned shifts from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...`);
        const unassignedShifts = await Shift.find({
            shift_date: { $gte: startDate, $lte: endDate },
            assigned_employee: null
        }).sort({ shift_date: 1, start_time: 1 });
        console.log(`[Assignment Service] Found ${unassignedShifts.length} unassigned shifts to process.`);

        if (unassignedShifts.length === 0) { console.log('[Assignment Service] No unassigned shifts found. Assignment complete.'); return 0; }

        // 3. Track assignments & hours during THIS run
        const employeeAssignmentsThisRun = new Map<string, { start: Date, end: Date }[]>(); 
        const employeeHoursPerWeek = new Map<string, number>(); 
        const assignmentsToMake: { shiftId: mongoose.Types.ObjectId, employeeId: mongoose.Types.ObjectId }[] = [];

        // 4. Iterate through shifts and attempt assignment
        console.log('[Assignment Service] Attempting assignments with overlap & hour limit check...');
        for (const shift of unassignedShifts) { 
            const requiredPos = shift.required_position;
            const availableCandidates = employeesByPosition[requiredPos] || [];

            if (availableCandidates.length > 0) {
                const shuffledCandidates = shuffleArray([...availableCandidates]);
                const currentShiftStartDateTime = createUTCDateTime(shift.shift_date, shift.start_time);
                let currentShiftEndDateTime = createUTCDateTime(shift.shift_date, shift.end_time);
                if (currentShiftEndDateTime <= currentShiftStartDateTime) { currentShiftEndDateTime.setUTCDate(currentShiftEndDateTime.getUTCDate() + 1); }

                // Determine the week identifier for this shift
                const weekStartDate = getWeekStartDate(shift.shift_date);
                const weekStartDateString = weekStartDate.toISOString().split('T')[0]; 

                let assigned = false;
                for (const candidate of shuffledCandidates) { 
                    const candidateIdStr = (candidate as any)._id.toString(); 
                    const existingAssignments = employeeAssignmentsThisRun.get(candidateIdStr) || [];

                    // Check 1: Overlap
                    const hasOverlap = existingAssignments.some(existing =>
                        currentShiftStartDateTime < existing.end && currentShiftEndDateTime > existing.start
                    );
                    if (hasOverlap) {
                        continue; 
                    }

                    // Check 2: Weekly Hour Limit
                    const weekKey = `${candidateIdStr}_${weekStartDateString}`;
                    const assignedHoursThisWeek = employeeHoursPerWeek.get(weekKey) || 0;
                    if (assignedHoursThisWeek + SHIFT_DURATION > WEEKLY_HOUR_LIMIT) {
                        continue; 
                    }

                    // --- Checks passed! Assign this candidate ---
                    assignmentsToMake.push({
                        shiftId: shift._id as mongoose.Types.ObjectId,
                        employeeId: (candidate as any)._id as mongoose.Types.ObjectId
                     });

                    // Record assignment for overlap check
                    if (!employeeAssignmentsThisRun.has(candidateIdStr)) { employeeAssignmentsThisRun.set(candidateIdStr, []); }
                    employeeAssignmentsThisRun.get(candidateIdStr)?.push({ start: currentShiftStartDateTime, end: currentShiftEndDateTime });

                    // Record hours for week limit check
                    employeeHoursPerWeek.set(weekKey, assignedHoursThisWeek + SHIFT_DURATION);

                    assigned = true;
                    break; 
                } 
            } 
        } 
        console.log(`[Assignment Service] Prepared ${assignmentsToMake.length} non-overlapping assignments respecting ${WEEKLY_HOUR_LIMIT}h limit.`);

        // 5. Perform Bulk Update
        if (assignmentsToMake.length > 0) {
            console.log(`[Assignment Service] Applying ${assignmentsToMake.length} assignments to database...`);
            const bulkOps: mongoose.AnyBulkWriteOperation<IShift>[] = assignmentsToMake.map(assignment => ({
                updateOne: {
                    filter: { _id: assignment.shiftId, assigned_employee: null },
                    update: { $set: { assigned_employee: assignment.employeeId } }
                }
            }));
            const result = await Shift.bulkWrite(bulkOps, { ordered: false });
            const assignedCount = result.modifiedCount || 0;
            console.log(`[Assignment Service] Assignment update result: ${assignedCount} shifts successfully updated.`);
            if (assignedCount !== assignmentsToMake.length) { console.warn(`[Assignment Service] Mismatch: ...`); }

            // --- ADD EMAIL NOTIFICATION LOGIC ---
            if (assignedCount > 0) {
                console.log('[Assignment Service] Preparing to send notifications...');
                try {
                    // Get the IDs of shifts that were intended for update
                    const assignedShiftIds = assignmentsToMake.map(a => a.shiftId);

                    const newlyAssignedShifts = await Shift.find({
                        _id: { $in: assignedShiftIds },
                        assigned_employee: { $ne: null }
                    })
                    .populate<{ assigned_employee: IEmployee | null }>('assigned_employee', 'name email'); 

                    type PopulatedShiftForEmail = IShift & {
                        assigned_employee: IEmployee & { email: string, name: string };
                   };

                    // Group shifts by employee email
                    const shiftsByEmployeeEmail = new Map<string, { name: string, shifts: PopulatedShiftForEmail[] }>();

                    newlyAssignedShifts.forEach(shift => {
                        if (shift.assigned_employee && !(shift.assigned_employee instanceof mongoose.Types.ObjectId) && shift.assigned_employee.email && shift.assigned_employee.name) {
                            const empEmail = shift.assigned_employee.email;
                            if (!shiftsByEmployeeEmail.has(empEmail)) {
                                shiftsByEmployeeEmail.set(empEmail, { name: shift.assigned_employee.name, shifts: [] });
                            }
                            shiftsByEmployeeEmail.get(empEmail)?.shifts.push(shift as PopulatedShiftForEmail);
                        }
                    });

                    // Send email to each employee
                    console.log(`[Assignment Service] Sending notifications to ${shiftsByEmployeeEmail.size} employees...`);
                    for (const [email, data] of shiftsByEmployeeEmail.entries()) {
                        await notificationService.sendScheduleNotification(
                            email,
                            data.name,
                            data.shifts,
                            targetMonthStr 
                        );
                    }
                    console.log('[Assignment Service] Finished sending notifications.');

                } catch (notificationError) {
                    console.error('[Assignment Service] Error during notification process:', notificationError);
                }
            }

            return assignedCount; 

        } else {
            console.log('[Assignment Service] No assignments could be made.');
            return 0;
        }

    }  catch (error) {
        console.error(`[Assignment Service] Error during assignment process for ${targetMonthStr}:`, error);
        throw new Error(`Employee assignment failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};