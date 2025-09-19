import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import mongoose from 'mongoose';
import * as employeeService from '../services/employeeService';
import { Shift, PerformanceLog } from '../models';
import * as forecastingService from '../services/forecastingService';
import * as schedulingService from '../services/schedulingService'; 
import * as performanceService from '../services/performanceService'; 
import { IEmployee } from '../models/Employee';

const adminRouter = Router();

// --- Middleware for parsing form data (Make sure urlencoded is global in app.ts) ---

// --- Reusable Validation Rules ---
const performanceLogValidationRules = [
  body('employee', 'Please select an employee.').isMongoId(), 
  body('log_date', 'Please enter a valid date.').isISO8601().toDate(), 
  body('rating').optional({ checkFalsy: true }) 
                .isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5.')
                .toInt(),
  body('notes').optional().trim().escape() 
];

const ALLOWED_POSITIONS = [
  'Manager', 'Host/Hostess', 'Server', 'Bartender',
  'Chef de Partie', 'Cook', 'Dishwasher', 'Chef', 'Sous Chef',
  'Busser' 
].sort();

const employeeValidationRules = [
  body('name', 'Employee name is required.').notEmpty().trim().escape(),
  body('position', 'Please select a valid position.')
      .isIn(ALLOWED_POSITIONS) 
      .withMessage('Invalid position selected.'), 
  body('email', 'Valid email is required.').isEmail().normalizeEmail(),
  body('hourly_rate').optional({ checkFalsy: true })
                     .isFloat({ min: 0 }).withMessage('Hourly rate cannot be negative.')
                     .toFloat()
];

// --- Employee List Route (GET /admin/employees) ---
adminRouter.get('/employees', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const employees = await employeeService.getAllEmployees();
    res.render('admin/employee_list', {
      title: 'Manage Employees',
      employees: employees,
      successFlash: req.flash('success'),
      errorFlash: req.flash('error')
    });
  } catch (error) {
    req.flash('error', 'Error loading employee list.');
    console.error("Error in GET /admin/employees:", error);
    res.redirect('/'); 
  }
});

// --- Add Employee Route (GET /admin/employee/add) ---
adminRouter.get('/employee/add', (req: Request, res: Response) => {
  res.render('admin/employee_form', {
    title: 'Add New Employee',
    employee: {},
    errors: [],
    editMode: false,
    positions: ALLOWED_POSITIONS, 
    successFlash: req.flash('success'),
    errorFlash: req.flash('error')
  });
});

// --- Add Employee Route (POST /admin/employee/add) ---
adminRouter.post(
  '/employee/add',
  employeeValidationRules,
  async (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render('admin/employee_form', {
        title: 'Add New Employee',
        employee: req.body,
        errors: errors.array(),
        editMode: false,
        positions: ALLOWED_POSITIONS, 
        successFlash: req.flash('success'),
        errorFlash: req.flash('error')
      });
    }

    // Validation passed
    try {
      const newEmployee = await employeeService.createEmployee(req.body);
      req.flash('success', `Employee "${newEmployee.name}" added successfully!`);
      res.redirect('/admin/employees');
    } catch (error: any) {
       req.flash('error', error.message || 'Error adding employee.');
       console.error("Error in POST /admin/employee/add:", error);
       res.status(400).render('admin/employee_form', {
          title: 'Add New Employee',
          employee: req.body, 
          errors: [{ msg: error.message }], 
          editMode: false,
          successFlash: req.flash('success'), 
          errorFlash: req.flash('error')
      });
    }
  }
);

// --- Edit Employee Route (GET /admin/employee/edit/:id) ---
adminRouter.get('/employee/edit/:id', async (req: Request, res: Response, next: NextFunction) => {
    const employeeId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        req.flash('error', 'Invalid Employee ID format.');
        return res.redirect('/admin/employees');
    }
    try {
        const employee = await employeeService.getEmployeeById(employeeId);
        if (!employee) {
            req.flash('error', 'Employee not found.');
            return res.redirect('/admin/employees');
        }
        res.render('admin/employee_form', {
          title: 'Edit Employee',
          employee: employee,
          errors: [],
          editMode: true,
          positions: ALLOWED_POSITIONS, 
          successFlash: req.flash('success'),
          errorFlash: req.flash('error')
        }); 
    } catch (error) {
        req.flash('error', 'Error loading employee for editing.');
        console.error("Error in GET /admin/employee/edit:", error);
        res.redirect('/admin/employees');
    }
});

// --- Edit Employee Route (POST /admin/employee/edit/:id) ---
adminRouter.post(
    '/employee/edit/:id',
    employeeValidationRules, 
    async (req: Request, res: Response, next: NextFunction) => {
        const employeeId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
             req.flash('error', 'Invalid Employee ID format.');
             return res.redirect('/admin/employees');
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const submittedData = { ...req.body, _id: employeeId }; 
            return res.status(400).render('admin/employee_form', {
              title: 'Edit Employee',
              employee: { /* ... submitted data ... */ },
              errors: errors.array(),
              editMode: true,
              positions: ALLOWED_POSITIONS, 
              successFlash: req.flash('success'),
              errorFlash: req.flash('error')
            });
        }

        // Validation passed
        try {
            const updatedEmployee = await employeeService.updateEmployee(employeeId, req.body);
            if (!updatedEmployee) {
                 req.flash('error', 'Employee not found during update.');
                 return res.redirect('/admin/employees');
            }
            req.flash('success', `Employee "${updatedEmployee.name}" updated successfully!`);
            res.redirect('/admin/employees');
        } catch (error: any) {
            req.flash('error', error.message || 'Error updating employee.');
            console.error("Error in POST /admin/employee/edit:", error);
             res.status(400).render('admin/employee_form', {
                title: 'Edit Employee',
                employee: { _id: employeeId, ...req.body }, 
                errors: [{ msg: error.message }], 
                editMode: true,
                successFlash: req.flash('success'), 
                errorFlash: req.flash('error')
            });
        }
    }
);

// --- Delete Employee Route (POST /admin/employee/delete/:id) ---
adminRouter.post('/employee/delete/:id', async (req: Request, res: Response, next: NextFunction) => {
    const employeeId = req.params.id;
    // Validate ID format
     if (!mongoose.Types.ObjectId.isValid(employeeId)) {
             req.flash('error', 'Invalid Employee ID format.');
             return res.redirect('/admin/employees');
     }
    try {

        const hasShifts = await Shift.exists({ assigned_employee: employeeId }); 
        const hasLogs = await PerformanceLog.exists({ employee: employeeId }); 

        if (hasShifts || hasLogs) {
             const relations = [];
             if (hasShifts) relations.push("shifts");
             if (hasLogs) relations.push("performance logs");
             req.flash('error', `Cannot delete employee. They have existing ${relations.join(' and ')}.`)
             return res.redirect('/admin/employees'); 
        }

        // Proceed with deletion
        const success = await employeeService.deleteEmployee(employeeId);
        if (success) {
            req.flash('success', 'Employee deleted successfully.');
        } else {
            req.flash('error', 'Employee not found for deletion.');
        }
    } catch (error: any) {
        req.flash('error', error.message || 'Error deleting employee.');
        console.error("Error in POST /admin/employee/delete:", error);
    }
    res.redirect('/admin/employees');
});


// --- Test Forecast Route (GET /admin/test-forecast) --- //
adminRouter.get('/test-forecast', async (req: Request, res: Response, next: NextFunction) => {
  const daysToPredict = 14; 
  console.log(`Accessed /admin/test-forecast route, predicting ${daysToPredict} days.`);
  try {
      const forecastData = await forecastingService.generateForecast(daysToPredict);
      console.log("[Route] Forecast service call successful.");
      res.json(forecastData); 
  } catch (error: any) {
      console.error("[Route] Error in /admin/test-forecast:", error);
      res.status(500).json({
           message: "Error generating or retrieving forecast.",
           error: error.message || String(error) 
      });
  }
});


// --- Generate Schedule Route (POST /admin/generate-schedule) --- // 
adminRouter.post('/generate-schedule', async (req: Request, res: Response, next: NextFunction) => {

  try {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth(); 

      const targetMonthIndex = (currentMonth + 1) % 12; 
      const targetYear = currentMonth === 11 ? currentYear + 1 : currentYear; 
      const targetMonthStartDate = new Date(Date.UTC(targetYear, targetMonthIndex, 1));

      const monthAfterTargetIndex = (targetMonthIndex + 1) % 12;
      const yearOfMonthafterTarget = targetMonthIndex === 11 ? targetYear + 1 : targetYear;
      const firstDayOfNextMonth = new Date(Date.UTC(yearOfMonthafterTarget, monthAfterTargetIndex, 1));

      const targetMonthEndDate = new Date(firstDayOfNextMonth.getTime() - 1); 

      const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const targetMonthStr = monthFormatter.format(targetMonthStartDate);

      console.log(`[Route /admin/generate-schedule] Request received to generate schedule for: ${targetMonthStr}`);
      console.log(`[Route /admin/generate-schedule] Target Date Range (UTC): ${targetMonthStartDate.toISOString()} to ${targetMonthEndDate.toISOString()}`);

      const createdShifts = await schedulingService.generateSchedule(targetMonthStartDate, targetMonthEndDate);

      req.flash('success', `Successfully generated ${createdShifts.length} shifts for ${targetMonthStr}.`);
      res.redirect('/admin/employees'); 

  } catch (error: any) {
      console.error('[Route /admin/generate-schedule] Error:', error);
      req.flash('error', `Failed to generate schedule: ${error.message || 'Unknown error'}`);
      res.redirect('/admin/employees'); 
  }
});

adminRouter.post('/assign-schedule', async (req: Request, res: Response, next: NextFunction) => {

  try {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const targetMonthIndex = today.getMonth();
      const targetYear = currentMonth === 11 ? currentYear + 1 : currentYear;
      const targetMonthStartDate = new Date(Date.UTC(targetYear, targetMonthIndex, 1));
      const monthAfterTargetIndex = (targetMonthIndex + 1) % 12;
      const yearOfMonthafterTarget = targetMonthIndex === 11 ? targetYear + 1 : targetYear;
      const firstDayOfNextMonth = new Date(Date.UTC(yearOfMonthafterTarget, monthAfterTargetIndex, 1));
      const targetMonthEndDate = new Date(firstDayOfNextMonth.getTime() - 1);

      const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const targetMonthStr = monthFormatter.format(targetMonthStartDate);

      console.log(`[Route /admin/assign-schedule] Request received to assign employees for: ${targetMonthStr}`);
      console.log(`[Route /admin/assign-schedule] Target Date Range (UTC): ${targetMonthStartDate.toISOString()} to ${targetMonthEndDate.toISOString()}`);

      const assignmentsMade = await schedulingService.assignEmployeesToShifts(targetMonthStartDate, targetMonthEndDate);

      req.flash('success', `Successfully attempted assignments for ${targetMonthStr}. ${assignmentsMade} shifts were updated.`);
      res.redirect('/schedule');

  } catch (error: any) {
      console.error('[Route /admin/assign-schedule] Error:', error);
      req.flash('error', `Failed to assign employees: ${error.message || 'Unknown error'}`);
      res.redirect('/admin/employees');
  }
});

// --- Add Performance Log Route (GET) ---
adminRouter.get('/performance/add', async (req: Request, res: Response, next: NextFunction) => {
  try {
      const employees = await employeeService.getAllEmployees();

      res.render('admin/performance_log_form', {
          title: 'Log Performance Review',
          employees: employees, 
          log: {}, 
          errors: [], 
          successFlash: req.flash('success'),
          errorFlash: req.flash('error')
      });
  } catch (error) {
      console.error('[Route GET /admin/performance/add] Error fetching employees:', error);
      req.flash('error', 'Failed to load performance log form.');
      res.redirect('/admin'); 
  }
});

// --- Add Performance Log Route (POST) ---
adminRouter.post(
  '/performance/add',
  performanceLogValidationRules, 
  async (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
          try {
              const employees = await employeeService.getAllEmployees(); 
              const submittedData = { ...req.body };
              if (submittedData.log_date instanceof Date) {
                  submittedData.log_date = submittedData.log_date.toISOString().split('T')[0];
              }

              return res.status(400).render('admin/performance_log_form', {
                  title: 'Log Performance Review',
                  employees: employees,
                  log: submittedData, 
                  errors: errors.array(), 
                  successFlash: req.flash('success'),
                  errorFlash: req.flash('error')
              });
          } catch (fetchError) {
               console.error('[Route POST /admin/performance/add] Error fetching employees after validation error:', fetchError);
               req.flash('error', 'An error occurred while reloading the form.');
               return res.redirect('/admin/employees'); 
          }
      }

      // Validation passed: Attempt to save the log
      try {
          const newLog = await performanceService.createPerformanceLog(req.body);

          req.flash('success', `Performance log added successfully for employee.`); 
          res.redirect('/admin/employees'); 

      } catch (error: any) {
          console.error('[Route POST /admin/performance/add] Error saving performance log:', error);
          req.flash('error', `Error saving performance log: ${error.message || 'Unknown database error'}`);

          // Re-render form with the error and submitted data
           try {
              const employees = await employeeService.getAllEmployees();
               const submittedData = { ...req.body };
               if (submittedData.log_date instanceof Date) {
                   submittedData.log_date = submittedData.log_date.toISOString().split('T')[0];
               }
              res.status(500).render('admin/performance_log_form', {
                  title: 'Log Performance Review',
                  employees: employees,
                  log: submittedData,
                  // Pass the service/database error back to the form
                  errors: [{ msg: `Error saving log: ${error.message || 'Unknown database error'}` }],
                  successFlash: req.flash('success'),
                  errorFlash: req.flash('error')
              });
           } catch (fetchError) {
               console.error('[Route POST /admin/performance/add] Error fetching employees after save error:', fetchError);
                res.redirect('/admin/employees');
           }
      }
  }
);

adminRouter.get('/performance/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
      // Fetch logs using the service function
      const performanceLogs = await performanceService.getPerformanceLogs();

      res.render('admin/performance_dashboard', {
          title: 'Performance Dashboard',
          logs: performanceLogs, 
          successFlash: req.flash('success'),
          errorFlash: req.flash('error')
      });
  } catch (error) {
      console.error('[Route GET /admin/performance/dashboard] Error fetching logs:', error);
      req.flash('error', 'Failed to load performance dashboard.');
      res.redirect('/admin/employees'); 
  }
});

export default adminRouter;