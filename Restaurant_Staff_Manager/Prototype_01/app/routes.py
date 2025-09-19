from flask import Blueprint, render_template, flash, redirect, url_for
from app.models import Employee, Shift
from app.utils import forecasting, scheduling
from app import db
from sqlalchemy.orm import joinedload
from collections import defaultdict
from datetime import timedelta
import datetime
import calendar

bp = Blueprint("main", __name__)


@bp.route("/")
@bp.route("/index")
def index():
    return render_template("index.html", title="Home")


@bp.route("/run_forecast")
def run_forecast_route():
    """Route to trigger the forecast generation and display results."""
    print("Accessed /run_forecast route")
    try:
        forecast_df = forecasting.generate_forecast()

        if forecast_df is not None:
            print("Forecast DataFrame generated successfully.")
            html_table = forecast_df.tail(10).to_html(border=1)
            return f"<h2>Forecast Results (Last 10 Periods)</h2>{html_table}"
        else:
            print("forecasting.generate_forecast() returned None.")
            return (
                "Error during forecast generation. Check container logs for details.",
                500,
            )

    except Exception as e:
        print(f"Exception in /run_forecast route: {e}")
        return f"An unexpected error occurred in the route: {e}", 500


@bp.route("/generate_schedule")
def generate_schedule_route():
    """Route to trigger the schedule generation for the current month."""
    print("Accessed /generate_schedule route")
    try:
        success = scheduling.create_schedule()

        if success:
            print("Scheduling function reported success.")
            flash(
                "New schedule generated successfully for the current month!", "success"
            )
        else:
            print("Scheduling function reported failure.")
            flash(
                "Error generating schedule for the current month. Check application logs for details.",
                "danger",
            )

    except Exception as e:
        print(f"Exception in /generate_schedule route: {e}")
        flash(
            f"An unexpected error occurred while trying to generate the schedule: {e}",
            "danger",
        )

    return redirect(url_for("main.index"))


@bp.route("/schedule")
def schedule_view():
    """Displays the generated schedule for the current month."""
    print("Accessed /schedule route")
    try:
        today = datetime.date.today()
        start_of_month = today.replace(day=1)
        days_in_month = calendar.monthrange(start_of_month.year, start_of_month.month)[
            1
        ]
        end_of_month = start_of_month + timedelta(days=days_in_month)
        month_name_str = start_of_month.strftime("%B %Y")

        print(f"Querying schedule for: {month_name_str}")

        shifts = (
            db.session.query(Shift)
            .options(joinedload(Shift.employee))
            .outerjoin(Shift.employee)
            .filter(Shift.start_time >= start_of_month, Shift.start_time < end_of_month)
            .order_by(Shift.start_time, Shift.required_position)
            .all()
        )

        print(
            f"Found {len(shifts)} shifts for {month_name_str} (including unassigned)."
        )

        weekly_shifts = defaultdict(list)
        weekly_costs = defaultdict(float)
        grand_total_cost = 0.0
        for shift in shifts:
            shift_date = shift.start_time.date()
            week_start = shift_date - timedelta(days=shift_date.weekday())
            weekly_shifts[week_start].append(shift)
            if shift.employee and shift.employee.hourly_rate:
                duration_hours = (
                    shift.end_time - shift.start_time
                ).total_seconds() / 3600
                shift_cost = duration_hours * shift.employee.hourly_rate
                weekly_costs[week_start] += shift_cost
                grand_total_cost += shift_cost

        sorted_weeks = sorted(weekly_shifts.keys())
        weekly_data = []
        for week_start_date in sorted_weeks:
            weekly_data.append(
                (
                    week_start_date,
                    weekly_shifts[week_start_date],
                    weekly_costs[week_start_date],
                )
            )
        print(f"Grouped shifts into {len(weekly_data)} weeks for {month_name_str}.")

        return render_template(
            "schedule_view.html",
            title=f"Schedule for {month_name_str}",
            month_name=month_name_str,
            weekly_data=weekly_data,
            grand_total_cost=grand_total_cost,
        )

    except Exception as e:
        print(f"Error querying/processing shifts: {e}")
        flash("Error loading schedule view.", "danger")
        return redirect(url_for("main.index"))



