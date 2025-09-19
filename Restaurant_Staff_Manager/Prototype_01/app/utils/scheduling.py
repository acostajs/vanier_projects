from app import db
from app.models import Employee, Shift
from . import forecasting
from .notifications import send_schedule_update_email
import datetime
from datetime import timedelta
import random
import pandas as pd
from collections import defaultdict
import calendar
import logging  

log = logging.getLogger(__name__)
logging.getLogger("cmdstanpy").setLevel(logging.WARNING)  
logging.getLogger("prophet").setLevel(logging.WARNING)  


# --- Define Shift Times & Staffing Rules ---

# Shift Definitions (Using time objects)
DAY_SHIFT_START = datetime.time(10, 0)  # 10:00 AM
DAY_SHIFT_END = datetime.time(18, 0)  #  6:00 PM (8 hours)
EVE_SHIFT_START = datetime.time(16, 0)  #  4:00 PM
EVE_SHIFT_END = datetime.time(0, 0)  # 12:00 AM Midnight

BASE_NEEDS = {
    "Day": {  # 10:00 - 18:00 Estimate
        "Manager": 1,
        "Host/Hostess": 1,
        "Server": 1,
        "Bartender": 1,
        "Chef de Partie": 1,
        "Cook": 2,
        "Dishwasher": 1,
        "Chef": 1,
    },
    "Eve": {  # 16:00 - 00:00 (Peak)
        "Manager": 1,
        "Host/Hostess": 1,
        "Server": 3,
        "Bartender": 1,
        "Chef de Partie": 2,
        "Cook": 4,
        "Dishwasher": 2,
        "Sous Chef": 1,
    },
}

# Optional: Extra staff needed only if forecast demand is high
HIGH_DEMAND_EXTRA = {
    "Eve": {"Server": 2, "Cook": 2}  
}


DEMAND_THRESHOLD = 175  # Adjust as needed

def create_schedule(target_date=None):
    """
    Generates a position-based, multi-shift schedule for a target month
    based on forecast, creating unassigned shifts if needed, saves shifts
    to DB, and sends notifications for assigned shifts.
    """
    log.info("--- Starting Advanced Schedule Generation ---")
    employee_shifts_to_notify = defaultdict(
        list
    )  
    employees_scheduled_this_run = {}  
    shifts_to_add_to_session = []  

    try:
        # 1. Determine Target Month
        if target_date is None:
            target_date = datetime.date.today()
        start_of_month = target_date.replace(day=1)
        days_in_month = calendar.monthrange(start_of_month.year, start_of_month.month)[
            1
        ]
        end_of_month_exclusive = start_of_month + timedelta(days=days_in_month)
        month_name_str = start_of_month.strftime("%B %Y")
        log.info(f"Targeting schedule generation for: {month_name_str}")

        # 2. Get Forecast
        days_to_forecast = 60
        log.info(f"Generating forecast for {days_to_forecast} days...")
        forecast_df = forecasting.generate_forecast(days_to_predict=days_to_forecast)
        if forecast_df is None:
            log.error("Forecast generation failed. Cannot create schedule.")
            return False
        forecast_df["ds"] = pd.to_datetime(
            forecast_df["ds"]
        ).dt.date  # Ensure only date part
        log.info("Forecast generated.")

        # 3. Get Employees and Group by Position
        employees = Employee.query.all()
        employees_by_position = defaultdict(list)
        if employees:
            for emp in employees:
                if emp.position:
                    employees_by_position[emp.position].append(emp)
            log.info(
                f"Found {len(employees)} employees, grouped into {len(employees_by_position)} positions."
            )
            if not employees_by_position:
                log.warning("No employees with positions found.")
        else:
            log.warning("No employees found in the database.")

        # 4. Clear existing shifts for the target month only
        log.info(f"Clearing existing shifts for {month_name_str}...")
        num_deleted = Shift.query.filter(
            Shift.start_time >= start_of_month,
            Shift.start_time < end_of_month_exclusive,
        ).delete(synchronize_session="fetch")
        log.info(
            f"{num_deleted} existing shifts cleared from session (pending commit)."
        )

        # 5. Loop Through Days and Shifts, Prepare Shift Objects
        log.info(f"Preparing new shifts for {month_name_str}...")
        for day_offset in range(days_in_month):
            current_date = start_of_month + timedelta(days=day_offset)
            log.debug(f"\nProcessing Date: {current_date.strftime('%Y-%m-%d (%a)')}")

            # Find forecast for the current day
            daily_forecast = forecast_df[forecast_df["ds"] == current_date]
            predicted_demand = (
                daily_forecast["yhat"].iloc[0] if not daily_forecast.empty else 0
            )
            is_high_demand = predicted_demand >= DEMAND_THRESHOLD
            log.debug(
                f"  Demand (yhat): {predicted_demand:.2f} -> {'High' if is_high_demand else 'Low'} Demand"
            )

            # --- Generate Shifts for Each Type (Day, Eve) ---
            for shift_type in ["Day", "Eve"]:
                log.debug(f"  Processing {shift_type} Shift Needs...")
                needs = BASE_NEEDS.get(shift_type, {}).copy()
                shift_start_time = (
                    DAY_SHIFT_START if shift_type == "Day" else EVE_SHIFT_START
                )
                shift_end_time = DAY_SHIFT_END if shift_type == "Day" else EVE_SHIFT_END

                if is_high_demand and shift_type in HIGH_DEMAND_EXTRA:
                    for pos, count in HIGH_DEMAND_EXTRA[shift_type].items():
                        needs[pos] = needs.get(pos, 0) + count
                    log.debug(
                        f"    (High demand: Added extra staff - {HIGH_DEMAND_EXTRA[shift_type]})"
                    )

                start_datetime = datetime.datetime.combine(
                    current_date, shift_start_time
                )
                end_date = (
                    current_date + timedelta(days=1)
                    if shift_end_time == datetime.time(0, 0)
                    else current_date
                )
                end_datetime = datetime.datetime.combine(end_date, shift_end_time)

                # --- Fill required positions for this shift ---
                for position, count_needed in needs.items():
                    if count_needed <= 0:
                        continue

                    log.debug(f"    Need {count_needed} x {position}")
                    available_for_pos = employees_by_position.get(position, [])

                    if not available_for_pos:
                        log.warning(
                            f"      No employees found for position: {position}. Creating {count_needed} UNASSIGNED shifts."
                        )
                        for i in range(count_needed):
                            new_shift = Shift(
                                employee_id=None,
                                start_time=start_datetime,
                                end_time=end_datetime,
                                required_position=position,
                            )
                            shifts_to_add_to_session.append(new_shift)
                        continue  

                    
                    shuffled_available = random.sample(
                        available_for_pos, len(available_for_pos)
                    )
                    assigned_employee_ids_this_slot_type = set()

                    log.debug(
                        f"      Available {position}s: {len(shuffled_available)}. Assigning up to: {count_needed}"
                    )

                    for i in range(count_needed): 
                        assigned_employee = None
                        
                        for emp in shuffled_available:
                        
                        
                            if emp.id not in assigned_employee_ids_this_slot_type:
                                assigned_employee = emp
                                assigned_employee_ids_this_slot_type.add(emp.id)
                                break  # Found one

                        
                        new_shift = Shift(
                            employee_id=assigned_employee.id
                            if assigned_employee
                            else None,
                            start_time=start_datetime,
                            end_time=end_datetime,
                            required_position=position,
                        )
                        shifts_to_add_to_session.append(
                            new_shift
                        ) 

                        if assigned_employee:
                            log.debug(
                                f"      -> Assigned {assigned_employee.name} to {position} shift slot {i + 1}."
                            )
                            employees_scheduled_this_run[assigned_employee.id] = (
                                assigned_employee
                            )
                            employee_shifts_to_notify[assigned_employee.id].append(
                                new_shift
                            ) 
                        else:
                            log.warning(
                                f"      -> No further available {position} found for slot {i + 1}/{count_needed}. Created UNASSIGNED shift."
                            )
  

        # 6. Add all prepared shifts and commit
        if shifts_to_add_to_session:
            log.info(
                f"\nAttempting to add and commit {len(shifts_to_add_to_session)} new shifts for {month_name_str}..."
            )
            db.session.add_all(shifts_to_add_to_session)
            db.session.commit()
            log.info("Shifts committed successfully.")

            # 7. Send Notifications (only for assigned shifts)
            log.info("--- Starting Email Notifications ---")
            notification_success_count = 0
            notification_fail_count = 0
            for emp_id, shifts_list in employee_shifts_to_notify.items():
                employee = employees_scheduled_this_run.get(emp_id)
                if employee and employee.email:  
                    log.info(
                        f"Attempting to send notification to {employee.name} ({employee.email})..."
                    )
                    shifts_list.sort(key=lambda x: x.start_time)
                    if send_schedule_update_email(employee, shifts_list):
                        notification_success_count += 1
                    else:
                        notification_fail_count += 1
                elif employee:
                    log.warning(
                        f"Cannot send email to {employee.name}, missing email address."
                    )
                    notification_fail_count += 1
                else:
                    log.warning(
                        f"Could not find employee object for ID {emp_id} during notification."
                    )
                    notification_fail_count += 1
            log.info(
                f"--- Email Notifications Finished: {notification_success_count} succeeded, {notification_fail_count} failed ---"
            )

        else:
           
            db.session.commit()
            log.info(
                f"No new shifts generated for {month_name_str}. Existing shifts for month cleared."
            )

        return True

    except Exception as e:
        db.session.rollback()
        log.error(
            f"ERROR during schedule generation for {target_date.strftime('%B %Y') if target_date else 'current month'}: {e}",
            exc_info=True,
        ) 
        return False
    finally:
        log.info("--- Schedule Generation Process Finished ---")
