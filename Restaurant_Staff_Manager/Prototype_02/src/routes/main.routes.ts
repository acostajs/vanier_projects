import { Router, Request, Response, NextFunction } from 'express';
import * as schedulingService from '../services/schedulingService'; 
import { IShift } from '../models/Shift'; 
import mongoose from 'mongoose';

const mainRouter = Router();

mainRouter.get('/', (req: Request, res: Response) => {

  res.render('index', { 
      title: 'Home - Pozole Staffing',
      successFlash: req.flash('success'),
      errorFlash: req.flash('error')
     });
});


// --- Schedule View Route (GET /schedule) ---
mainRouter.get('/schedule', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const requestedYear = parseInt(req.query.year as string, 10);
        const requestedMonth = parseInt(req.query.month as string, 10); 

        let targetYear: number;
        let targetMonthIndex: number; 

        const today = new Date();
        const todayDateString = today.toISOString().split('T')[0]; 

        if ( !isNaN(requestedYear) && requestedYear > 1900 && 
             !isNaN(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 )
        {
            targetYear = requestedYear;
            targetMonthIndex = requestedMonth - 1; 
            console.log(`[Route /schedule] Requested specific month: ${targetYear}-${requestedMonth}`);
        } else {
            targetMonthIndex = today.getMonth(); 
            targetYear = today.getFullYear();    
            console.log(`[Route /schedule] Defaulting to next month: ${targetYear}-${targetMonthIndex + 1}`);
        }

        // --- Calculate Date Range for Displayed Month ---
        const viewStartDate = new Date(Date.UTC(targetYear, targetMonthIndex, 1)); 
        const monthAfterTargetIndex = (targetMonthIndex + 1) % 12;
        const yearOfMonthafterTarget = targetMonthIndex === 11 ? targetYear + 1 : targetYear;
        const firstDayOfNextMonth = new Date(Date.UTC(yearOfMonthafterTarget, monthAfterTargetIndex, 1));
        const viewEndDate = new Date(firstDayOfNextMonth.getTime() - 1); 

        const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        const viewMonthStr = monthFormatter.format(viewStartDate);
        console.log(`[Route /schedule] Displaying schedule for: ${viewMonthStr}`);

        const prevMonthDate = new Date(viewStartDate);
        prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
        const prevYear = prevMonthDate.getUTCFullYear();
        const prevMonth = prevMonthDate.getUTCMonth() + 1; 

        const nextMonthDate = new Date(viewStartDate);
        nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
        const nextYear = nextMonthDate.getUTCFullYear();
        const nextMonth = nextMonthDate.getUTCMonth() + 1; 

        const shifts = await schedulingService.getShiftsForPeriod(viewStartDate, viewEndDate);

        // --- Prepare Data Structure for Calendar Grid (includes cost calculation) ---
        const scheduleViewData = { weeks: [] as any[] , monthlyTotalCost: "0.00", viewMonthStr: viewMonthStr };
        const shiftsByDate = new Map<string, IShift[]>();
        let monthlyTotalCostNum = 0;
        const shiftDuration = 8;

        shifts.forEach(shift => {
            const dateStr = shift.shift_date.toISOString().split('T')[0];
            let shiftCost = 0;
            if (shift.assigned_employee && !(shift.assigned_employee instanceof mongoose.Types.ObjectId) && typeof shift.assigned_employee.hourly_rate === 'number') {
                shiftCost = shiftDuration * shift.assigned_employee.hourly_rate;
            }
            (shift as any).cost = shiftCost.toFixed(2);
            if (!shiftsByDate.has(dateStr)) { shiftsByDate.set(dateStr, []); }
            shiftsByDate.get(dateStr)?.push(shift);
            monthlyTotalCostNum += shiftCost;
        });
        scheduleViewData.monthlyTotalCost = monthlyTotalCostNum.toFixed(2);

        const firstDayOfMonthWeekday = viewStartDate.getUTCDay();
        const calendarStartDate = new Date(viewStartDate);
        calendarStartDate.setUTCDate(viewStartDate.getUTCDate() - firstDayOfMonthWeekday);
        const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0));
        const lastDayOfMonthWeekday = lastDayOfMonth.getUTCDay();
        const calendarEndDate = new Date(lastDayOfMonth);
        calendarEndDate.setUTCDate(lastDayOfMonth.getUTCDate() + (6 - lastDayOfMonthWeekday));

        let currentWeek: any[] = []; 
        let weekIndex = 0;
        let currentWeeklyCostNum = 0;

        for (let day = new Date(calendarStartDate); day <= calendarEndDate; day.setUTCDate(day.getUTCDate() + 1)) {
            const dateStr = day.toISOString().split('T')[0];
            const dayShifts = shiftsByDate.get(dateStr) || [];
            let dailyTotalCostNum = 0;
            dayShifts.forEach(shift => { dailyTotalCostNum += parseFloat((shift as any).cost || 0); });
            currentWeek.push({
                date: new Date(day), dayOfMonth: day.getUTCDate(),
                isCurrentMonth: day.getUTCMonth() === targetMonthIndex,
                isToday: dateStr === todayDateString,
                dailyTotalCost: dailyTotalCostNum.toFixed(2), shifts: dayShifts
            });
            currentWeeklyCostNum += dailyTotalCostNum;
            if (day.getUTCDay() === 6 || day.getTime() === calendarEndDate.getTime()) {
                scheduleViewData.weeks.push({ weekNumber: weekIndex++, weeklyTotalCost: currentWeeklyCostNum.toFixed(2), days: currentWeek });
                currentWeek = []; currentWeeklyCostNum = 0;
            }
        }
        // --- End Data Structure Preparation ---

        res.render('schedule_view', {
            title: `Schedule for ${viewMonthStr}`,
            scheduleViewData: scheduleViewData,
            monthlyTotalCost: scheduleViewData.monthlyTotalCost,
            viewMonthStr: viewMonthStr,
            navData: {
                prevYear: prevYear,
                prevMonth: prevMonth,
                nextYear: nextYear,
                nextMonth: nextMonth
            },
            successFlash: req.flash('success'),
            errorFlash: req.flash('error')
        });

    } catch (error: any) {
        console.error('[Route /schedule] Error fetching or rendering schedule:', error);
        req.flash('error', `Could not load schedule view: ${error.message || 'Unknown error'}`);
        res.redirect('/');
    }
});

export default mainRouter;